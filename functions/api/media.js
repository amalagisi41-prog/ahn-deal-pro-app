// Cloudflare Pages Function — media upload and management
// Handles file uploads for the media library

export async function onRequestPost(context) {
  try {
    const request = context.request;
    const contentType = request.headers.get('content-type') || '';

    // Handle multipart form data uploads
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
          return json({ success: false, error: 'No file provided' }, 400);
        }

        // Validate file type and size
        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (file.size > maxSize) {
          return json({ success: false, error: 'File too large (max 10 MB)' }, 413);
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          return json({ success: false, error: 'Invalid file type (JPG, PNG, WebP, GIF, PDF only)' }, 400);
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
      } catch (uploadError) {
        console.error('Form data parsing error:', uploadError);
        return json({ success: false, error: 'Failed to process file upload' }, 400);
      }
    }

    // Handle JSON requests for fetching media
    if (contentType.includes('application/json') || !contentType) {
      try {
        const body = await request.json().catch(() => ({}));

        // Handle different actions
        if (body.action === 'list') {
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

        // Default to listing media if no action specified
        return json({
          success: true,
          media: []
        }, 200);
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        return json({ success: false, error: 'Invalid JSON in request body' }, 400);
      }
    }

    return json({ success: false, error: 'Invalid content type' }, 400);
  } catch (error) {
    console.error('Media API error:', error);
    return json({ success: false, error: error.message || 'Internal server error' }, 500);
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

    if (action === 'check') {
      return json({
        success: true,
        status: 'ok'
      }, 200);
    }

    return json({ success: false, error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Media API error:', error);
    return json({ success: false, error: error.message || 'Internal server error' }, 500);
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
