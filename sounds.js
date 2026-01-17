/**
 * Call Center Chaos - Sound Manager
 * Generates 8-bit style sound effects using Web Audio API
 */

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.volume = 0.3;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    // Resume audio context on user interaction (required by browsers)
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    // Create an oscillator-based sound
    playTone(frequency, duration, type = 'square', volume = this.volume) {
        if (!this.enabled || !this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    // Phone call sound - classic 8-bit telephone ring
    playCallSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        for (let i = 0; i < 2; i++) {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, time + i * 0.15);
            osc.frequency.setValueAtTime(698, time + i * 0.15 + 0.05);
            
            gain.gain.setValueAtTime(0.15, time + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, time + i * 0.15 + 0.1);
            
            osc.start(time + i * 0.15);
            osc.stop(time + i * 0.15 + 0.1);
        }
    }

    // Cash register sound for revenue
    playCashSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        const frequencies = [523, 659, 784, 1047];
        
        frequencies.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, time + i * 0.05);
            
            gain.gain.setValueAtTime(0.2, time + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, time + i * 0.05 + 0.15);
            
            osc.start(time + i * 0.05);
            osc.stop(time + i * 0.05 + 0.15);
        });
    }

    // Coffee pour sound
    playCoffeeSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, time);
        filter.frequency.linearRampToValueAtTime(200, time + 0.3);
        
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.linearRampToValueAtTime(100, time + 0.3);
        
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
        
        osc.start(time);
        osc.stop(time + 0.3);
    }

    // Coffee dump sound - splash/pour out
    playCoffeeDumpSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        
        // Create noise for splash
        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.audioContext.createBufferSource();
        const filter = this.audioContext.createBiquadFilter();
        const gain = this.audioContext.createGain();
        
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, time);
        filter.frequency.linearRampToValueAtTime(500, time + 0.4);
        
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
        
        noise.start(time);
        noise.stop(time + 0.4);
    }

    // Bathroom door sound
    playBathroomSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        
        // Door creak
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.linearRampToValueAtTime(100, time + 0.15);
        osc.frequency.linearRampToValueAtTime(180, time + 0.2);
        
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
        
        osc.start(time);
        osc.stop(time + 0.25);
    }

    // Manager footstep sound
    playFootstepSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80 + Math.random() * 40, time);
        
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
        
        osc.start(time);
        osc.stop(time + 0.08);
    }

    // Send employee back - authority sound
    playSendBackSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        
        // Whistle-like authority sound
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, time);
        osc.frequency.setValueAtTime(800, time + 0.1);
        osc.frequency.setValueAtTime(600, time + 0.2);
        
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
        
        osc.start(time);
        osc.stop(time + 0.25);
    }

    // Employee stress increase warning
    playStressWarningSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, time);
        osc.frequency.setValueAtTime(180, time + 0.1);
        
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        
        osc.start(time);
        osc.stop(time + 0.2);
    }

    // Game over sound
    playGameOverSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        const frequencies = [440, 392, 349, 294];
        
        frequencies.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, time + i * 0.2);
            
            gain.gain.setValueAtTime(0.25, time + i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, time + i * 0.2 + 0.3);
            
            osc.start(time + i * 0.2);
            osc.stop(time + i * 0.2 + 0.3);
        });
    }

    // Win sound - triumphant fanfare
    playWinSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        const frequencies = [523, 659, 784, 1047, 1319, 1568];
        
        frequencies.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, time + i * 0.1);
            
            gain.gain.setValueAtTime(0.2, time + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, time + i * 0.1 + 0.25);
            
            osc.start(time + i * 0.1);
            osc.stop(time + i * 0.1 + 0.25);
        });
    }

    // Click/select sound for UI
    playClickSound() {
        if (!this.enabled || !this.audioContext) return;
        this.playTone(660, 0.1, 'square', 0.15);
    }

    // Employee walking sound
    playWalkSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(60 + Math.random() * 20, time);
        
        gain.gain.setValueAtTime(0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        
        osc.start(time);
        osc.stop(time + 0.05);
    }

    // Critical sanity alarm
    playCriticalAlarmSound() {
        if (!this.enabled || !this.audioContext) return;
        
        const time = this.audioContext.currentTime;
        
        for (let i = 0; i < 3; i++) {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, time + i * 0.15);
            
            gain.gain.setValueAtTime(0.2, time + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, time + i * 0.15 + 0.1);
            
            osc.start(time + i * 0.15);
            osc.stop(time + i * 0.15 + 0.1);
        }
    }

    // Toggle sound
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // Set volume
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
}

// Global sound manager instance
const soundManager = new SoundManager();
