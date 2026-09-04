/**
 * Call Center Chaos - Camera
 *
 * A zoomed view that follows the boss around the isometric office. The scene
 * is still drawn in the same screen-space coordinates as before; the camera
 * only decides which slice of it fills the canvas, so nothing downstream of
 * worldToScreen() has to know it exists.
 */

class Camera {
    constructor(viewWidth, viewHeight) {
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;
        
        const config = CONFIG.camera || {};
        this.zoom = config.zoom || 1;
        this.smoothing = config.smoothing !== undefined ? config.smoothing : 5;
        this.deadzoneX = config.deadzoneX || 0;
        this.deadzoneY = config.deadzoneY || 0;
        this.lookAheadSeconds = config.lookAheadSeconds || 0;
        this.focusOffsetY = config.focusOffsetY || 0;
        
        // Centre of the view, in the scene's unzoomed screen coordinates
        this.x = viewWidth / 2;
        this.y = viewHeight / 2;
        
        // Screen-space rectangle the camera is allowed to look at
        this.bounds = null;
        
        this.applied = false;
    }
    
    /**
     * Where the camera would like to be: the boss's feet, lifted a little so
     * his body sits in the middle of the frame rather than the floor under him,
     * and led slightly in the direction he is running.
     */
    focusPoint(office, boss) {
        const lead = this.lookAheadSeconds * boss.speed;
        const point = office.worldToScreen(
            boss.x + (boss.velocityX || 0) * lead,
            boss.y + (boss.velocityY || 0) * lead
        );
        point.y += this.focusOffsetY;
        return point;
    }
    
    /**
     * Ease toward the boss, ignoring the small drift inside the deadzone so
     * that pacing around a desk doesn't set the whole office sliding.
     */
    follow(office, boss, deltaTime) {
        this.bounds = office.sceneBounds();
        const focus = this.focusPoint(office, boss);
        const targetX = this.settle(this.x, focus.x, this.deadzoneX);
        const targetY = this.settle(this.y, focus.y, this.deadzoneY);
        
        // Frame-rate independent exponential ease
        const t = this.smoothing > 0
            ? 1 - Math.exp(-this.smoothing * (deltaTime / 1000))
            : 1;
        
        this.x += (targetX - this.x) * t;
        this.y += (targetY - this.y) * t;
        
        this.clamp();
    }
    
    /** Jump straight to the boss - used when a game starts. */
    snapTo(office, boss) {
        this.bounds = office.sceneBounds();
        const focus = this.focusPoint(office, boss);
        this.x = focus.x;
        this.y = focus.y;
        this.clamp();
    }
    
    settle(current, target, deadzone) {
        if (deadzone <= 0) return target;
        if (target > current + deadzone) return target - deadzone;
        if (target < current - deadzone) return target + deadzone;
        return current;
    }
    
    /**
     * Keep the visible slice inside the area the office actually paints, so a
     * zoomed view never exposes blank canvas at the edges of the map. When the
     * view is wider than the scene on an axis, centre on it instead.
     */
    clamp() {
        if (!this.bounds) return;
        
        const halfWidth = this.viewWidth / (2 * this.zoom);
        const halfHeight = this.viewHeight / (2 * this.zoom);
        
        this.x = this.clampAxis(this.x, this.bounds.left, this.bounds.right, halfWidth);
        this.y = this.clampAxis(this.y, this.bounds.top, this.bounds.bottom, halfHeight);
    }
    
    clampAxis(value, min, max, half) {
        if (max - min <= half * 2) return (min + max) / 2;
        return Math.max(min + half, Math.min(max - half, value));
    }
    
    /** Everything drawn between apply() and release() is seen through the camera. */
    apply(ctx) {
        ctx.save();
        ctx.translate(this.viewWidth / 2, this.viewHeight / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
        this.applied = true;
    }
    
    release(ctx) {
        if (!this.applied) return;
        ctx.restore();
        this.applied = false;
    }
}
