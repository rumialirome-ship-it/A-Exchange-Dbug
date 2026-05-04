
import { useState, useEffect, useCallback } from 'react';

export const useCountdown = (drawTime: string) => {
    const [display, setDisplay] = useState<{status: 'LOADING' | 'SOON' | 'OPEN' | 'CLOSED', text: string}>({ status: 'LOADING', text: '...' });

    const getCycle = useCallback(() => {
        const now = new Date();
        // PKT is UTC+5. Simulate PKT bias for logical calculations.
        const pktBias = new Date(now.getTime() + (5 * 60 * 60 * 1000));
        const [drawHours, drawMinutes] = drawTime.split(':').map(Number);
        
        // 1. Calculate START (the most recent 4:00 PM PKT)
        const openTime = new Date(pktBias);
        openTime.setUTCHours(16, 0, 0, 0);
        if (pktBias.getUTCHours() < 16) {
            openTime.setUTCDate(openTime.getUTCDate() - 1);
        }

        // 2. Calculate END (the draw time)
        const closeTime = new Date(openTime);
        closeTime.setUTCHours(drawHours, drawMinutes, 0, 0);
        if (drawHours < 16) {
            closeTime.setUTCDate(closeTime.getUTCDate() + 1);
        }

        // 3. Determine Market Status based on PKT bias
        const isCurrentlyOpen = pktBias >= openTime && pktBias < closeTime;

        return { 
            openTime, 
            closeTime,
            pktBias,
            isCurrentlyOpen
        };
    }, [drawTime]);

    useEffect(() => {
        const formatTime12h = (hours24: number, minutes: number) => {
            const ampm = hours24 >= 12 ? 'PM' : 'AM';
            const h = hours24 % 12 || 12;
            return `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
        };

        const update = () => {
            const { openTime, closeTime, pktBias, isCurrentlyOpen } = getCycle();
            
            if (isCurrentlyOpen) {
                // Distance calculation: Compare timestamps with the same bias
                const distance = closeTime.getTime() - pktBias.getTime();
                
                if (distance <= 0) {
                    setDisplay({ status: 'CLOSED', text: 'CLOSED' });
                } else {
                    const h = Math.floor(distance / (1000 * 60 * 60));
                    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((distance % (1000 * 60)) / 1000);
                    setDisplay({
                        status: 'OPEN',
                        text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                    });
                }
            } else {
                if (pktBias < openTime) {
                    setDisplay({ status: 'SOON', text: formatTime12h(openTime.getUTCHours(), openTime.getUTCMinutes()) });
                } else {
                    const nextOpen = new Date(openTime);
                    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
                    setDisplay({ status: 'SOON', text: formatTime12h(nextOpen.getUTCHours(), nextOpen.getUTCMinutes()) });
                }
            }
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [getCycle]);

    return display;
};
