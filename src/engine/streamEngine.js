import cron from 'node-cron';
import { google } from 'googleapis';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import process from 'process';

// Store active ffmpeg processes so we can kill them
const activeStreams = new Map();

export const initStreamEngine = (db) => {
  console.log('Stream Engine Initialized. Worker is running...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      
      // Fetch all active schedules
      const activeSchedules = await db.all('SELECT * FROM schedules WHERE status IN ("pending", "live", "starting")');
      
      for (const schedule of activeSchedules) {
        // Parse start date time
        const startDateTime = new Date(`${schedule.start_date}T${schedule.start_time}:00`);
        const endDateTime = new Date(`${schedule.end_date}T${schedule.end_time}:00`);
        
        // 1. Check if it's time to STOP
        if (now >= endDateTime && schedule.status === "live") {
          console.log(`[ENGINE] Stopping schedule: ${schedule.title} (${schedule.id})`);
          await stopStream(db, schedule.id);
          continue;
        }

        // 2. Check if it's time to START or RESUME
        if (now >= startDateTime && now < endDateTime) {
          if (schedule.status === "pending") {
            console.log(`[ENGINE] Starting schedule: ${schedule.title} (${schedule.id})`);
            await startStream(db, schedule);
          } else if (schedule.status === "live" || schedule.status === "starting") {
            // If it's live/starting but FFmpeg is missing from memory, it crashed!
            if (!activeStreams.has(schedule.id)) {
              console.warn(`[ENGINE] WARNING: Stream ${schedule.id} is marked as ${schedule.status} but FFmpeg is NOT running! Initiating Auto-Resume...`);
              await resumeStream(db, schedule);
            }
          }
        }
      }

    } catch (err) {
      console.error('[ENGINE] Error in cron job:', err);
    }
  });
};

async function startStream(db, schedule) {
  try {
    // 1. Mark as 'starting' to prevent duplicate triggers
    await db.run('UPDATE schedules SET status = "starting" WHERE id = ?', [schedule.id]);

    // 2. Fetch Account credentials
    const account = await db.get('SELECT * FROM accounts WHERE id = ?', [schedule.account_id]);
    if (!account) throw new Error('Account not found');

    const tokens = JSON.parse(account.credentials_json);
    const oauth2Client = new google.auth.OAuth2(account.client_id, account.client_secret);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // 3. Create Live Broadcast
    console.log('[ENGINE] Creating YouTube Live Broadcast...');
    const broadcastRes = await youtube.liveBroadcasts.insert({
      part: 'snippet,status,contentDetails',
      requestBody: {
        snippet: {
          title: schedule.title,
          description: schedule.description || 'Live stream powered by Live Terjadwal',
          scheduledStartTime: new Date(Date.now() + 5000).toISOString() // Start in 5 seconds
        },
        status: {
          privacyStatus: schedule.privacy || 'public',
          selfDeclaredMadeForKids: false
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: true,
          monitorStream: { enableMonitorStream: false }
        }
      }
    });

    const broadcastId = broadcastRes.data.id;

    // 4. Create Live Stream
    console.log('[ENGINE] Creating YouTube Live Stream Key...');
    const streamRes = await youtube.liveStreams.insert({
      part: 'snippet,cdn',
      requestBody: {
        snippet: { title: `Stream for ${schedule.title}` },
        cdn: {
          frameRate: '30fps',
          ingestionType: 'rtmp',
          resolution: '1080p'
        }
      }
    });

    const streamId = streamRes.data.id;
    const streamName = streamRes.data.cdn.ingestionInfo.streamName;
    const rtmpUrl = streamRes.data.cdn.ingestionInfo.ingestionAddress;

    // 5. Bind Broadcast and Stream
    console.log('[ENGINE] Binding Broadcast to Stream Key...');
    await youtube.liveBroadcasts.bind({
      part: 'id,contentDetails',
      id: broadcastId,
      streamId: streamId
    });

    // Save mapping to DB
    await db.run('UPDATE schedules SET broadcast_id = ?, stream_id = ?, rtmp_url = ?, stream_name = ? WHERE id = ?', 
      [broadcastId, streamId, rtmpUrl, streamName, schedule.id]);

    await launchFFmpeg(db, schedule, rtmpUrl, streamName);

  } catch (error) {
    console.error(`[ENGINE] Failed to start stream for schedule ${schedule.id}:`, error);
    await db.run('UPDATE schedules SET status = "error" WHERE id = ?', [schedule.id]);
  }
}

export async function resumeStream(db, schedule) {
  try {
    console.log(`[ENGINE] Auto-resuming crashed stream for schedule ${schedule.id}...`);
    if (!schedule.rtmp_url || !schedule.stream_name) {
       throw new Error('Cannot resume: Missing RTMP URL or Stream Name in database.');
    }
    // Update status to starting just in case
    await db.run('UPDATE schedules SET status = "starting" WHERE id = ?', [schedule.id]);
    await launchFFmpeg(db, schedule, schedule.rtmp_url, schedule.stream_name);
  } catch (error) {
    console.error(`[ENGINE] Auto-resume failed for schedule ${schedule.id}:`, error);
    await db.run('UPDATE schedules SET status = "error" WHERE id = ?', [schedule.id]);
  }
}

async function launchFFmpeg(db, schedule, rtmpUrl, streamName) {
  try {
    // 6. Build the random playlist
    console.log(`[ENGINE] Building Playlist for schedule ${schedule.id}...`);
    const playlist = await db.get('SELECT * FROM playlists WHERE id = ?', [schedule.media_source]);
    if (!playlist) throw new Error('Playlist not found');

    const items = JSON.parse(playlist.items);
    if (!items || items.length === 0) throw new Error('Playlist is empty');

    // Filter only video files for now (MP4)
    const videos = items.filter(item => item.type === 'video');
    if (videos.length === 0) throw new Error('No videos found in playlist');

    // Shuffle videos randomly
    const shuffled = videos.sort(() => 0.5 - Math.random());
    
    // Create concat.txt
    const listPath = path.join(process.cwd(), 'uploads', `list_${schedule.id}.txt`);
    
    // Convert paths to absolute safely for ffmpeg concat
    const listContent = shuffled.map(v => {
      // url = /uploads/filename.mp4, so we get filename
      const filename = v.url.split('/').pop();
      const absPath = path.join(process.cwd(), 'uploads', filename).replace(/\\/g, '/');
      return `file '${absPath}'`;
    }).join('\n');
    
    fs.writeFileSync(listPath, listContent);

    // 7. Configure FFmpeg Options
    console.log('[ENGINE] Configuring FFmpeg Options...');
    const fullRtmpUrl = `${rtmpUrl}/${streamName}`;
    
    const loopMode = schedule.loop_mode === 'once' ? '0' : '-1';
    let inputOpts = ['-f', 'concat', '-safe', '0', '-re', '-stream_loop', loopMode];
    let outputOpts = [];

    // Video Quality Setup
    if (schedule.video_quality === 'copy') {
      outputOpts = ['-c:v', 'copy', '-c:a', 'copy', '-f', 'flv'];
    } else {
      let vBitrate = '2500k';
      let bufsize = '5000k';
      
      if (schedule.video_quality === '1080p') {
        vBitrate = '4500k'; bufsize = '9000k';
      } else if (schedule.video_quality === '480p') {
        vBitrate = '1000k'; bufsize = '2000k';
      }
      
      outputOpts = [
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', vBitrate, '-maxrate', vBitrate, '-bufsize', bufsize,
        '-pix_fmt', 'yuv420p', '-g', '60',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-f', 'flv'
      ];
    }

    let command = ffmpeg().input(listPath).inputOptions(inputOpts);

    // Background Music Setup (Replace Audio with Audio Playlist)
    if (schedule.background_music && schedule.background_music !== 'none') {
      const audioPlaylist = await db.get('SELECT * FROM playlists WHERE id = ?', [schedule.background_music]);
      if (audioPlaylist) {
        const audioItems = JSON.parse(audioPlaylist.items);
        const audios = audioItems.filter(item => item.type === 'audio');
        
        if (audios.length > 0) {
          // Shuffle audio tracks randomly
          const shuffledAudios = audios.sort(() => 0.5 - Math.random());
          
          // Create concat.txt for audio
          const audioListPath = path.join(process.cwd(), 'uploads', `audio_list_${schedule.id}.txt`);
          const audioListContent = shuffledAudios.map(a => {
            const filename = a.url.split('/').pop();
            const absPath = path.join(process.cwd(), 'uploads', filename).replace(/\\/g, '/');
            return `file '${absPath}'`;
          }).join('\n');
          fs.writeFileSync(audioListPath, audioListContent);
          
          // Pass audio list as second input
          command = command.input(audioListPath).inputOptions(['-f', 'concat', '-safe', '0', '-re', '-stream_loop', '-1']);
          
          // If copy mode, we MUST transcode audio because we are mapping new audio
          if (schedule.video_quality === 'copy') {
            outputOpts = ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-f', 'flv'];
          }
          
          outputOpts.push('-map', '0:v:0');
          outputOpts.push('-map', '1:a:0');
          
          // If not looping infinite, use -shortest so audio stops when video ends
          if (loopMode === '0') {
            outputOpts.push('-shortest');
          }
        }
      }
    }

    console.log('[ENGINE] Launching FFmpeg...');
    command = command.outputOptions(outputOpts).output(fullRtmpUrl)
      .on('start', async (cmdline) => {
        console.log('[FFMPEG] Started:', cmdline);
        await db.run('UPDATE schedules SET status = "live" WHERE id = ?', [schedule.id]);
      })
      .on('error', async (err) => {
        console.error('[FFMPEG] Error:', err.message);
        await db.run('UPDATE schedules SET status = "error" WHERE id = ?', [schedule.id]);
        activeStreams.delete(schedule.id);
      })
      .on('end', async () => {
        console.log('[FFMPEG] Stream ended naturally');
        await db.run('UPDATE schedules SET status = "completed" WHERE id = ?', [schedule.id]);
        activeStreams.delete(schedule.id);
      });

    command.run();
    activeStreams.set(schedule.id, command);

  } catch (error) {
    console.error(`[ENGINE] Failed to launch FFmpeg for schedule ${schedule.id}:`, error);
    await db.run('UPDATE schedules SET status = "error" WHERE id = ?', [schedule.id]);
  }
}

export async function stopStream(db, scheduleId) {
  const command = activeStreams.get(scheduleId);
  if (command) {
    command.kill('SIGKILL');
    activeStreams.delete(scheduleId);
    console.log(`[ENGINE] Killed FFmpeg process for schedule ${scheduleId}`);
  }
  await db.run('UPDATE schedules SET status = "completed" WHERE id = ?', [scheduleId]);
}
