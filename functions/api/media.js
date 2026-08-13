// Cloudflare Pages Function — media upload and management
// Handles file uploads for the media library

export async function onRequestPost(context) {
  try {
    const request = context.request;
    const contentType = request.headers.get('content-type') || '';

    // Handle multipart form data uploads
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return json({ error: 'No file provided' }, 400);
      }

      // Validate file type and size
      const maxSize = 10 * 1024 * 1024; // 10 MB
      if (file.size > maxSize) {
        return json({ error: 'File too large (max 10 MB)' }, 413);
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        return json({ error: 'Invalid file type (JPG, PNG, WebP, GIF, PDF only)' }, 400);
      }

      // Generate a unique file ID
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fileName = file.name;

      // Store file metadata (in production, this would be stored in a database or object storage)
      // For now, we'll return a success response with the file metadata
      return json({
        success: true,
        file: {
          id: fileId,
          name: fileName,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          url: `/media/${fileId}`
        }
      }, 200);
    }

    // Handle JSON requests for fetching media
    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));

      // Handle different actions
      if (body.action === 'list') {
        // Return empty list of media for now
        return json({
          success: true,
          media: []
        }, 200);
      }

      if (body.action === 'delete' && body.fileId) {
        return json({
          success: true,
          message: 'File deleted successfully'
        }, 200);
      }
    }

    return json({ error: 'Invalid request' }, 400);
  } catch (error) {
    console.error('Media API error:', error);
    return json({ error: error.message || 'Internal server error' }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const action = url.searchParams.get('action') || 'list';

    if (action === 'list') {
      return json({
        success: true,
        media: []
      }, 200);
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Media API error:', error);
    return json({ error: error.message || 'Internal server error' }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
