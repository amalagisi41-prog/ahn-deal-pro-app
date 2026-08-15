export async function onRequest(context) {
  const response = await context.next();

  // Set headers to allow iframe embedding (for website studio preview)
  response.headers.set('X-Frame-Options', 'ALLOWALL');
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return response;
}
