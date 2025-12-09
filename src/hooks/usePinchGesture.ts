import { useEffect, useRef, useCallback, useState } from 'react';

interface PinchState {
  isPinching: boolean;
  scale: number;
  initialDistance: number;
}

interface UsePinchGestureOptions {
  onPinchStart?: () => void;
  onPinchEnd?: (scale: number) => void;
  onPinchIn?: () => void;  // Scale < 1
  onPinchOut?: () => void; // Scale > 1
  threshold?: number;      // Minimum scale change to trigger
  enabled?: boolean;
}

export function usePinchGesture(
  elementRef: React.RefObject<HTMLElement | null>,
  options: UsePinchGestureOptions = {}
) {
  const {
    onPinchStart,
    onPinchEnd,
    onPinchIn,
    onPinchOut,
    threshold = 0.3,
    enabled = true,
  } = options;

  const [isPinching, setIsPinching] = useState(false);
  const pinchState = useRef<PinchState>({
    isPinching: false,
    scale: 1,
    initialDistance: 0,
  });

  const getDistance = useCallback((touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || e.touches.length !== 2) return;

    const distance = getDistance(e.touches);
    pinchState.current = {
      isPinching: true,
      scale: 1,
      initialDistance: distance,
    };
    setIsPinching(true);
    onPinchStart?.();
  }, [enabled, getDistance, onPinchStart]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || !pinchState.current.isPinching || e.touches.length !== 2) return;

    const currentDistance = getDistance(e.touches);
    const scale = currentDistance / pinchState.current.initialDistance;
    pinchState.current.scale = scale;

    // Prevent default to avoid browser zoom
    e.preventDefault();
  }, [enabled, getDistance]);

  const handleTouchEnd = useCallback((_e: TouchEvent) => {
    if (!enabled || !pinchState.current.isPinching) return;

    const finalScale = pinchState.current.scale;
    setIsPinching(false);

    // Determine if pinch was significant enough
    if (Math.abs(1 - finalScale) >= threshold) {
      if (finalScale < 1) {
        onPinchIn?.();
      } else {
        onPinchOut?.();
      }
    }

    onPinchEnd?.(finalScale);

    pinchState.current = {
      isPinching: false,
      scale: 1,
      initialDistance: 0,
    };
  }, [enabled, threshold, onPinchIn, onPinchOut, onPinchEnd]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [elementRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { isPinching };
}

