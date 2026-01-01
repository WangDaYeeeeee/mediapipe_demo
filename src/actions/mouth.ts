import { SingleFaceLandmarkerResult } from "../face_detection";
import { ActionDetector, VideoSize } from "./detector";

export class OpenMouthDetector implements ActionDetector {

  private readonly mouthOpenThreshold: number;

  constructor(mouthOpenThreshold: number = 0.4) {
    this.mouthOpenThreshold = mouthOpenThreshold;
  }

  detect(singleResult: SingleFaceLandmarkerResult, _: VideoSize): boolean {
    const mouthOpenScroe = singleResult.faceBlendshapes.get('jawOpen') ?? 0;
    return mouthOpenScroe > this.mouthOpenThreshold;
  }
  
  reset(): void {
    // do nothing.
  }
}

export class CloseMouthDetector implements ActionDetector {

  detect(singleResult: SingleFaceLandmarkerResult, _: VideoSize): boolean {
    const jawOpen = singleResult.faceBlendshapes.get('jawOpen') ?? 0;
    console.log('jawOpen', jawOpen);
    return jawOpen < 0.1
  }
  
  reset(): void {
    // do nothing.
  }
}