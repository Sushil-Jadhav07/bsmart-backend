const axios = require('axios');

let accessToken = null;
let tokenExpiresAt = 0;

/**
 * Gets a valid Spotify access token (Client Credentials Flow).
 * Refreshes the token if it's expired or about to expire.
 */
const getAccessToken = async () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment variables.');
  }

  // Check if token is valid (with a 60-second buffer)
  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    const response = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      }
    });

    accessToken = response.data.access_token;
    // expires_in is in seconds, convert to ms
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
    
    console.log('Spotify access token refreshed successfully.');
    return accessToken;
  } catch (error) {
    console.error('Error fetching Spotify access token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Spotify.');
  }
};

/**
 * Returns an axios instance configured with the Spotify Access Token.
 * Automatically handles token injection.
 */
const spotifyClient = async () => {
  const token = await getAccessToken();

  return axios.create({
    baseURL: 'https://api.spotify.com/v1',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

module.exports = spotifyClient;
