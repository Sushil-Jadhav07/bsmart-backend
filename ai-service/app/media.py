"""Media URLs, image downloads and video frames."""
import io
import logging
import re
import subprocess
import urllib.request

from PIL import Image

log = logging.getLogger(__name__)

_LEGACY_UPLOADS = re.compile(r'^https?://api\.bebsmart\.in/uploads/', re.I)
VIDEO_URL = re.compile(r'\.(mp4|mov|webm|ogg|mkv|m4v|m3u8)(\?.*)?$', re.I)
MAX_SIDE = 448  # CLIP looks at 224×224, so there is no point decoding more


def resolve_media_url(file_name, file_url, settings):
    """Python port of resolveMediaUrl in src/controllers/post.controller.js."""
    cloudfront = settings.cloudfront_base_url
    base = settings.public_base_url
    file_url = str(file_url or '')
    file_name = str(file_name or '')

    if file_url.startswith('http'):
        if cloudfront and 'api.bebsmart.in/uploads/' in file_url:
            return _LEGACY_UPLOADS.sub(f'{cloudfront}/uploads/', file_url)
        return file_url
    if file_name:
        if file_name.startswith(('uploads/', '/uploads/')):
            return f'{cloudfront or base}/{file_name.lstrip("/")}'
        return f'{cloudfront or base}/uploads/{file_name}'
    if file_url:
        return f'{base}{file_url}' if file_url.startswith('/') else f'{base}/{file_url}'
    return ''


def download_image(url, settings):
    """Returns a small RGB PIL image, or None if the URL is not a readable image."""
    if not url or not url.startswith(('http://', 'https://')) or VIDEO_URL.search(url):
        return None
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'bsmart-ai-service/1.0'})
        with urllib.request.urlopen(request, timeout=settings.media_timeout_s) as response:
            if str(response.headers.get('Content-Type', '')).startswith('video/'):
                return None
            data = response.read(settings.media_max_bytes + 1)
        if len(data) > settings.media_max_bytes:
            return None
        image = Image.open(io.BytesIO(data))
        image.draft('RGB', (MAX_SIDE, MAX_SIDE))  # fast JPEG decode at reduced size
        image = image.convert('RGB')
        image.thumbnail((MAX_SIDE, MAX_SIDE))
        return image
    except Exception as err:  # network errors, 403s, non-image bodies …
        log.info('Image download failed for %s: %s', url, err)
        return None


def extract_video_frames(url, settings, offsets=(1, 4, 8)):
    """A few frames from a video (MP4 or HLS) via ffmpeg. Empty if ffmpeg is missing."""
    frames = []
    for offset in offsets:
        try:
            result = subprocess.run(
                [settings.ffmpeg_path, '-v', 'error', '-ss', str(offset), '-i', url,
                 '-frames:v', '1', '-vf', f'scale={MAX_SIDE}:-2', '-f', 'image2pipe', '-vcodec', 'png', '-'],
                capture_output=True, timeout=settings.media_timeout_s * 2, check=False)
        except (OSError, subprocess.TimeoutExpired) as err:
            log.info('Frame extraction failed for %s: %s', url, err)
            break
        if result.returncode == 0 and result.stdout:
            frames.append(Image.open(io.BytesIO(result.stdout)).convert('RGB'))
    return frames
