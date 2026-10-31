import { Composition, Folder } from "remotion";
import { ShowcaseCompositions } from "./Composition";
import { Opening } from "./scenes/Opening";
import { Crafts } from "./scenes/Crafts";
import { RealTools } from "./scenes/RealTools";
import { Robyn } from "./scenes/Robyn";
import { BrowserNotes } from "./scenes/BrowserNotes";
import { Media } from "./scenes/Media";
import { Revisions } from "./scenes/Revisions";
import { Closing } from "./scenes/Closing";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <ShowcaseCompositions />
      <Folder name="Chapters">
        <Composition
          id="IdeasHaveWings"
          component={Opening}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={240}
        />
        <Composition
          id="ThreeStudios"
          component={Crafts}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={240}
        />
        <Composition
          id="RealTools"
          component={RealTools}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={315}
        />
        <Composition
          id="OneRobyn"
          component={Robyn}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={240}
        />
        <Composition
          id="BrowserAndNotes"
          component={BrowserNotes}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={240}
        />
        <Composition
          id="Media"
          component={Media}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={240}
        />
        <Composition
          id="SavedRevisions"
          component={Revisions}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={240}
        />
        <Composition
          id="Invitation"
          component={Closing}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={150}
        />
      </Folder>
    </>
  );
};
