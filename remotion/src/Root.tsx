import React from "react";
import { Composition } from "remotion";
import { Lesson } from "./Lesson";
import { computeTotalFrames } from "./ir/timeline";
import type { LessonIR } from "./ir/types";
import factoring01 from "./data/factoring-01.json";

const FPS = 30;
const defaultIr = factoring01 as unknown as LessonIR;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Lesson"
      component={Lesson}
      durationInFrames={computeTotalFrames(defaultIr, FPS)}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={{ ir: defaultIr }}
      calculateMetadata={({ props }) => {
        const ir = props.ir as LessonIR;
        return { durationInFrames: computeTotalFrames(ir, FPS), fps: FPS, width: 1280, height: 720 };
      }}
    />
  );
};
