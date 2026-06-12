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
      
      // Fetch all pending schedules
      const pendingSchedules = await db.all('SELECT * FROM schedules WHERE status = "pending"');
      
      for (const schedule of pendingSchedules) {
        // Parse start date time
        const startDateTime = new Date(`${schedule.start_date}T${schedule.start_time}:00`);
        
        if (now >= startDateTime) {
          console.log(`[ENGINE] Starting schedule: ${schedule.title} (${schedule.id})`);
          await startStream(db, schedule);
        }
      }

      // Check for streams that need to stop
      const liveSchedules = await db.all('SELECT * FROM schedules WHERE status = "live"');
      for (const schedule of liveSchedules) {
        const endDateTime = new Date(`${schedule.end_date}T${schedule.end_time}:00`);
        if (now >= endDateTime) {
          console.log(`[ENGINE] Stopping schedule: ${schedule.title} (${schedule.id})`);
          await stopStream(db, schedule.id);
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
    await db.run('UPDATE schedules SET broadcast_id = ?, stream_id = ? WHERE id = ?', [broadcastId, streamId, schedule.id]);

    // 6. Build the random playlist
    console.log('[ENGINE] Building Playlist for FFmpeg...');
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

    // 7. Launch FFmpeg
    console.log('[ENGINE] Launching FFmpeg...');
    const fullRtmpUrl = `${rtmpUrl}/${streamName}`;

    const command = ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0', '-re', '-stream_loop', '-1'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-pix_fmt', 'yuv420p',
        '-g', '60',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-f', 'flv'
      ])
      .output(fullRtmpUrl)
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
    console.error(`[ENGINE] Failed to start stream for schedule ${schedule.id}:`, error);
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
