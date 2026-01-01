import { SingleFaceLandmarkerResult } from "../face_detection";
import { ActionDetector, VideoSize } from "./detector";

class BlinkDetector implements ActionDetector {

  private readonly blinkThreshold: number;

  constructor(blinkThreshold: number = 0.35) {
    this.blinkThreshold = blinkThreshold;
  }

  detect(singleResult: SingleFaceLandmarkerResult, _: VideoSize): boolean {
    const leftEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkLeft') ?? 0;
    const rightEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkRight') ?? 0;
    return leftEyeBlinkScore > this.blinkThreshold && rightEyeBlinkScore > this.blinkThreshold;
  }
  
  reset(): void {
    // do nothing.
  }
}