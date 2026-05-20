export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  response.status(200).json({
    hasFootballApiKey: Boolean(process.env.FOOTBALL_API_KEY),
    provider: process.env.FOOTBALL_API_PROVIDER || null,
    nodeEnv: process.env.NODE_ENV || null,
  })
}
