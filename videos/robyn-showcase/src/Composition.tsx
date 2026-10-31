import {
  AbsoluteFill,
  Composition,
  Sequence,
  Still,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { Audio } from "@remotion/media";
import { BirdGuide, ContinuousBirdContext } from "./components/AsciiBird";
import { Opening } from "./scenes/Opening";
import { Crafts } from "./scenes/Crafts";
import { RealTools } from "./scenes/RealTools";
import { Robyn } from "./scenes/Robyn";
import { BrowserNotes } from "./scenes/BrowserNotes";
import { Media } from "./scenes/Media";
import { Revisions } from "./scenes/Revisions";
import { Closing } from "./scenes/Closing";
import { C, ease } from "./theme";

type ShowcaseProps = { music: boolean };

export const Showcase = ({ music }: ShowcaseProps) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  return (
    <ContinuousBirdContext.Provider value={true}>
      <AbsoluteFill style={{ background: C.paper }}>
        <TransitionSeries>
          <TransitionSeries.Sequence
            name="01 — Ideas have wings"
            durationInFrames={8 * fps}
            premountFor={fps}
          >
            <Opening />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={wipe({ direction: "from-left" })}
            timing={linearTiming({ durationInFrames: 0.5 * fps })}
          />
          <TransitionSeries.Sequence
            name="02 — Three studios, 26 Crafts"
            durationInFrames={8 * fps}
            premountFor={fps}
          >
            <Crafts />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={wipe({ direction: "from-left" })}
            timing={linearTiming({ durationInFrames: 0.5 * fps })}
          />
          <TransitionSeries.Sequence
            name="03 — Real tools, your touch"
            durationInFrames={10.5 * fps}
            premountFor={fps}
          >
            <RealTools />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={wipe({ direction: "from-left" })}
            timing={linearTiming({ durationInFrames: 0.5 * fps })}
          />
          <TransitionSeries.Sequence
            name="04 — One Robyn, three studios"
            durationInFrames={8 * fps}
            premountFor={fps}
          >
            <Robyn />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={wipe({ direction: "from-left" })}
            timing={linearTiming({ durationInFrames: 0.5 * fps })}
          />
          <TransitionSeries.Sequence
            name="05 — Browser tools and Notes"
            durationInFrames={8 * fps}
            premountFor={fps}
          >
            <BrowserNotes />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={wipe({ direction: "from-left" })}
            timing={linearTiming({ durationInFrames: 0.5 * fps })}
          />
          <TransitionSeries.Sequence
            name="06 — Creative ingredients"
            durationInFrames={8 * fps}
            premountFor={fps}
          >
            <Media />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={wipe({ direction: "from-left" })}
            timing={linearTiming({ durationInFrames: 0.5 * fps })}
          />
          <TransitionSeries.Sequence
            name="07 — Save and continue"
            durationInFrames={8 * fps}
            premountFor={fps}
          >
            <Revisions />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={wipe({ direction: "from-left" })}
            timing={linearTiming({ durationInFrames: 0.5 * fps })}
          />
          <TransitionSeries.Sequence
            name="08 — Invitation"
            durationInFrames={5 * fps}
            premountFor={fps}
          >
            <Closing />
          </TransitionSeries.Sequence>
        </TransitionSeries>
        <BirdGuide />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: interpolate(frame, [0, 60 * fps - 1], [0, 1920], ease),
            height: 5,
            background: C.rust,
          }}
        />
        <Audio
          name="Original score — Paper and Wings"
          src={staticFile("audio/paper-and-wings.wav")}
          premountFor={fps}
          volume={0.85}
          muted={!music}
        />
      </AbsoluteFill>
    </ContinuousBirdContext.Provider>
  );
};

export const Poster = () => {
  const { fps } = useVideoConfig();
  // A Still has a one-frame root clock. Offset its scene clock to a settled
  // opening pose; Freeze beyond the root duration would clamp back to zero.
  return (
    <ContinuousBirdContext.Provider value={true}>
      <Sequence
        name="Opening at four seconds"
        from={-4 * fps}
        durationInFrames={5 * fps}
        premountFor={fps}
      >
        <Opening />
        <BirdGuide />
      </Sequence>
    </ContinuousBirdContext.Provider>
  );
};

// Six 8s scenes + 10.5s tools + 5s close − seven 0.5s overlaps = 60s.
export const ShowcaseCompositions = () => (
  <>
    <Composition
      id="RobynShowcase"
      component={Showcase}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={1800}
      defaultProps={{ music: true }}
    />
    <Still id="RobynPoster" component={Poster} width={1920} height={1080} />
  </>
);
