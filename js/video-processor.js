// Video Processing Module
// Handles video compositing, perspective transforms, and export

class VideoProcessor {
    constructor() {
        this.gameplayVideo = null;
        this.bannerVideo = null;
        this.canvas = null;
        this.ctx = null;
        this.isPlaying = false;
        this.animationFrameId = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.currentBillboard = null;
    }

    initialize(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    setVideos(gameplayVideo, bannerVideo) {
        this.gameplayVideo = gameplayVideo;
        this.bannerVideo = bannerVideo;
    }

    setBillboard(billboard) {
        this.currentBillboard = billboard;
    }

    // Render single frame with video banner composited onto gameplay
    renderFrame() {
        if (!this.gameplayVideo || !this.ctx) return;

        // Draw gameplay video
        this.ctx.drawImage(this.gameplayVideo, 0, 0, this.canvas.width, this.canvas.height);

        // If banner video exists and billboard is defined, composite it
        if (this.bannerVideo && this.currentBillboard && this.bannerVideo.readyState >= 2) {
            this.compositeBannerWithPerspective(this.currentBillboard);
        }
    }

    // Apply perspective transformation to banner video
    compositeBannerWithPerspective(billboard) {
        const perspective = billboard.perspective;

        // Create temporary canvas for banner
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        // Get banner dimensions
        tempCanvas.width = this.bannerVideo.videoWidth;
        tempCanvas.height = this.bannerVideo.videoHeight;

        // Draw banner to temp canvas
        tempCtx.drawImage(this.bannerVideo, 0, 0);

        // Apply perspective transform using destination coordinates
        this.ctx.save();

        // Calculate transform matrix for perspective
        const corners = [
            perspective.topLeft,
            perspective.topRight,
            perspective.bottomLeft,
            perspective.bottomRight
        ];

        // Use quadrilateral transformation
        this.drawPerspectiveImage(
            tempCanvas,
            corners[0].x, corners[0].y,  // top-left
            corners[1].x, corners[1].y,  // top-right
            corners[2].x, corners[2].y,  // bottom-left
            corners[3].x, corners[3].y   // bottom-right
        );

        this.ctx.restore();
    }

    // Draw image with perspective transformation (quadrilateral mapping)
    drawPerspectiveImage(sourceCanvas, x0, y0, x1, y1, x2, y2, x3, y3) {
        // Calculate transformation matrix
        // This is a simplified version - for production, use a proper affine/perspective transform library

        // For now, use a simple quadrilateral approximation with triangles
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        // Split quad into two triangles and render
        // Triangle 1: top-left, top-right, bottom-left
        this.drawTriangle(
            sourceCanvas,
            0, 0, w, 0, 0, h,
            x0, y0, x1, y1, x2, y2
        );

        // Triangle 2: top-right, bottom-right, bottom-left
        this.drawTriangle(
            sourceCanvas,
            w, 0, w, h, 0, h,
            x1, y1, x3, y3, x2, y2
        );
    }

    // Draw triangle with texture mapping
    drawTriangle(sourceCanvas, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(dx0, dy0);
        this.ctx.lineTo(dx1, dy1);
        this.ctx.lineTo(dx2, dy2);
        this.ctx.closePath();
        this.ctx.clip();

        // Calculate transform for this triangle
        const denom = (sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1));
        if (Math.abs(denom) < 0.0001) {
            this.ctx.restore();
            return;
        }

        // Apply affine transform approximation
        const m11 = -(dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom;
        const m12 = (dy1 * sy0 - dy0 * sy1 + dy2 * (sy1 - sy0) - dy1 * sy2 + dy0 * sy2) / denom;
        const m21 = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom;
        const m22 = -(dx1 * sy0 - dx0 * sy1 + dx2 * (sy1 - sy0) - dx1 * sy2 + dx0 * sy2) / denom;
        const dx = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / denom;
        const dy = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / denom;

        this.ctx.transform(m11, m12, m21, m22, dx, dy);
        this.ctx.drawImage(sourceCanvas, 0, 0);
        this.ctx.restore();
    }

    // Start playback loop
    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;

        // Sync videos
        if (this.gameplayVideo) this.gameplayVideo.play();
        if (this.bannerVideo) this.bannerVideo.play();

        // Start render loop
        const renderLoop = () => {
            if (!this.isPlaying) return;

            this.renderFrame();
            this.animationFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop();
    }

    // Stop playback
    stop() {
        this.isPlaying = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.gameplayVideo) this.gameplayVideo.pause();
        if (this.bannerVideo) this.bannerVideo.pause();
    }

    // Pause playback
    pause() {
        this.isPlaying = false;
        if (this.gameplayVideo) this.gameplayVideo.pause();
        if (this.bannerVideo) this.bannerVideo.pause();
    }

    // Start recording the composited video
    startRecording() {
        this.recordedChunks = [];

        const stream = this.canvas.captureStream(30); // 30 FPS

        // Use WebM format with VP9 codec
        const options = {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 2500000 // 2.5 Mbps
        };

        // Fallback to VP8 if VP9 not supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8';
        }

        this.mediaRecorder = new MediaRecorder(stream, options);

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.start();
        this.play();
    }

    // Stop recording and return blob
    stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                resolve(blob);
            };

            this.mediaRecorder.stop();
            this.stop();
        });
    }

    // Export as WebM
    async exportWebM() {
        const blob = await this.stopRecording();
        if (!blob) return null;

        return {
            blob: blob,
            filename: `in-game-ad-${Date.now()}.webm`
        };
    }

    // Reset processor
    reset() {
        this.stop();
        this.gameplayVideo = null;
        this.bannerVideo = null;
        this.currentBillboard = null;
        this.recordedChunks = [];
    }
}

// Export for use in other modules
window.VideoProcessor = VideoProcessor;
