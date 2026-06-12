export const apiFetch = async (url, options = {}) => {
  const apiKey = localStorage.getItem('api_key');
  
  const headers = {
    ...options.headers,
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem('api_key');
    window.location.href = '/login';
    throw new Error('Unauthorized Access. Please login.');
  }

  return response;
};
