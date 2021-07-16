import React, { useState, useRef, MutableRefObject, useEffect } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import {
  selectorFamily,
  useRecoilValue,
  useRecoilCallback,
  selector,
} from "recoil";
import { animated, useSpring } from "react-spring";
import { v4 as uuid } from "uuid";

import * as labelAtoms from "./Filters/utils";
import { ContentDiv, ContentHeader } from "./utils";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { useEventHandler, useTheme } from "../utils/hooks";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import {
  FrameOptions,
  ImageOptions,
  VideoOptions,
} from "@fiftyone/looker/src/state";
import ExternalLink from "./ExternalLink";
import { Warning } from "@material-ui/icons";

type LookerTypes = typeof FrameLooker | typeof ImageLooker | typeof VideoLooker;

const lookerType = selectorFamily<LookerTypes, string>({
  key: "lookerType",
  get: (sampleId) => ({ get }) => {
    const video = get(selectors.sampleMimeType(sampleId)).startsWith("video/");
    const isFrame = get(selectors.isFramesView);
    const isPatch = get(selectors.isPatchesView);
    if (video && (isFrame || isPatch)) {
      return FrameLooker;
    }

    if (video) {
      return VideoLooker;
    }
    return ImageLooker;
  },
});

const InfoWrapper = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 100;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 125%;
  svg {
    font-size: 200%;
    color: ${({ theme }) => theme.fontDark};
  }
  svg.error {
    color: ${({ theme }) => theme.error};
  }
  p {
    margin: 0;
  }
`;

const TagBlock = styled.div`
  margin: 0;
`;

const BorderDiv = styled.div`
  border-top: 2px solid ${({ theme }) => theme.font};
  width: 100%;
  padding: 0.5rem 0 0;
`;

const AttrBlock = styled.div`
  padding: 0.1rem 0 0 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-row-gap: 0.1rem;
  grid-column-gap: 0.5rem;
`;

const TooltipDiv = animated(styled(ContentDiv)`
  position: absolute;
  margin-top: 0;
  left: -1000;
  top: -1000;
  z-index: 20000;
  pointer-events: none;
`);

type placement = number | "unset";

const computeCoordinates = ([x, y]: [number, number]): {
  bottom?: placement;
  top?: placement;
  left?: placement;
  right?: placement;
} => {
  let top: placement = y,
    bottom: placement = "unset";
  if (y > window.innerHeight / 2) {
    bottom = window.innerHeight - y;
    top = "unset";
  }

  return {
    bottom,
    top,
    left: x <= window.innerWidth / 2 ? x + 24 : "unset",
    right: x > window.innerWidth / 2 ? window.innerWidth - x + 24 : "unset",
  };
};

const ContentItemDiv = styled.div`
  margin: 0;
  padding: 0;
  max-width: 10rem;
  word-wrap: break-word;
`;

const ContentValue = styled.div`
  font-size: 0.8rem;
  font-weight: bold;
  color: ${({ theme }) => theme.font};
`;

const ContentName = styled.div`
  font-size: 0.7rem;
  font-weight: bold;
  padding-bottom: 0.3rem;
  color: ${({ theme }) => theme.fontDark};
`;

const ContentItem = ({
  name,
  value,
  style,
}: {
  name: string;
  value?: number | string;
  style?: object;
}) => {
  if (typeof value === "object") {
    return null;
  }

  return (
    <ContentItemDiv style={style}>
      <ContentValue>
        {(() => {
          switch (typeof value) {
            case "number":
              return Number.isInteger(value) ? value : value.toFixed(3);
            case "string":
              return value.length ? value : '""';
            case "boolean":
              return value ? "True" : "False";
            default:
              return "None";
          }
        })()}
      </ContentValue>
      <ContentName>{name}</ContentName>
    </ContentItemDiv>
  );
};

const useTarget = (field, target) => {
  const getTarget = useRecoilValue(selectors.getTarget);
  return getTarget(field, target);
};

const AttrInfo = ({ label, children = null }) => {
  let entries = Object.entries(label).filter(
    ([k, v]) => "tags" !== k && !k.startsWith("_")
  );
  if (!entries || !entries.length) {
    return null;
  }

  const defaults = entries.filter(([name]) =>
    ["label", "confidence"].includes(name)
  );

  const other = entries.filter(
    ([name]) => !["label", "confidence"].includes(name)
  );
  const mapper = ([name, value]) => (
    <ContentItem key={name} name={name} value={value} />
  );

  return (
    <>
      {defaults.map(mapper)}
      {children}
      {other.map(mapper)}
    </>
  );
};

const ClassificationInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const DetectionInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const KeypointInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const SegmentationInfo = ({ detail }) => {
  const targetValue = useTarget(detail.field, detail.target);

  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <ContentItem key={"target-value"} name={"label"} value={targetValue} />
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const PolylineInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const Border = ({ color, id }) => {
  const selectedLabels = useRecoilValue(selectors.selectedLabelIds);
  return (
    <BorderDiv
      style={{
        borderTop: `2px ${
          selectedLabels.has(id) ? "dashed" : "solid"
        } ${color}`,
      }}
    />
  );
};

const OVERLAY_INFO = {
  Classification: ClassificationInfo,
  Detection: DetectionInfo,
  Keypoint: KeypointInfo,
  Segmentation: SegmentationInfo,
  Polyline: PolylineInfo,
};

const TagInfo = ({ tags }: { tags: string[] }) => {
  if (!tags) {
    return null;
  }
  return (
    <TagBlock>
      <ContentItem
        key={"tags"}
        name={"tags"}
        value={tags.length ? tags.join(", ") : "No tags"}
        style={{ maxWidth: "20rem" }}
      />
    </TagBlock>
  );
};

const TooltipInfo = React.memo(({ looker }: { looker: any }) => {
  const [detail, setDetail] = useState(null);
  const [coords, setCoords] = useState<{
    top?: placement;
    bottom?: placement;
    left?: placement;
  }>({
    top: -1000,
    left: -1000,
    bottom: "unset",
  });
  const position = detail
    ? coords
    : { top: -1000, left: -1000, bottom: "unset" };

  const coordsProps = useSpring({
    ...position,
    config: {
      duration: 0,
    },
  });
  const ref = useRef<HTMLDivElement>(null);

  useEventHandler(looker, "tooltip", (e) => {
    setDetail(e.detail ? e.detail : null);
    e.detail && setCoords(computeCoordinates(e.detail.coordinates));
  });

  const showProps = useSpring({
    display: detail ? "block" : "none",
    opacity: detail ? 1 : 0,
  });
  const Component = detail ? OVERLAY_INFO[detail.type] : null;

  return Component
    ? ReactDOM.createPortal(
        <TooltipDiv
          style={{ ...coordsProps, ...showProps, position: "fixed" }}
          ref={ref}
        >
          <ContentHeader key="header">{detail.field}</ContentHeader>
          <Border color={detail.color} id={detail.label._id} />
          {detail.label.tags && detail.label.tags.length > 0 && (
            <TagInfo key={"tags"} tags={detail.label?.tags} />
          )}
          <Component key={"attrs"} detail={detail} />
        </TooltipDiv>,
        document.body
      )
    : null;
});

type EventCallback = (event: CustomEvent) => void;

const defaultLookerOptions = selectorFamily({
  key: "defaultLookerOptions",
  get: (modal: boolean) => ({ get }) => {
    const showConfidence = get(selectors.appConfig).show_confidence;
    const showIndex = get(selectors.appConfig).show_index;
    const showLabel = get(selectors.appConfig).show_label;
    const showTooltip = get(selectors.appConfig).show_tooltip;
    const useFrameNumber = get(selectors.appConfig).use_frame_number;
    const video = get(selectors.isVideoDataset)
      ? { loop: modal ? get(selectors.appConfig).loop_videos : true }
      : {};
    const zoom = get(selectors.isPatchesView)
      ? { zoom: get(atoms.cropToContent(modal)) }
      : {};
    const colorByLabel = get(atoms.colorByLabel(modal));

    return {
      colorByLabel,
      showConfidence,
      showIndex,
      showLabel,
      useFrameNumber,
      showTooltip,
      ...video,
      ...zoom,
    };
  },
});

const lookerOptions = selector<
  Partial<FrameOptions | ImageOptions | VideoOptions>
>({
  key: "lookerOptions",
  get: ({ get }) => {
    return {
      colorMap: get(selectors.colorMap(false)),
    };
  },
});

const lookerModalOptions = selector<
  Partial<FrameOptions | ImageOptions | VideoOptions>
>({
  key: "lookerModalOptions",
  get: ({ get }) => {
    return {
      ...get(defaultLookerOptions(true)),
      colorMap: get(selectors.colorMap(true)),
      filter: get(labelFilters(true)),
      ...get(atoms.savedLookerOptions),
      selectedLabels: [...get(selectors.selectedLabelIds)],
      fullscreen: get(atoms.fullscreen),
    };
  },
});

const useLookerOptionsUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async (event: CustomEvent) => {
      const currentOptions = await snapshot.getPromise(
        atoms.savedLookerOptions
      );
      set(atoms.savedLookerOptions, { ...currentOptions, ...event.detail });
    }
  );
};

const useFullscreen = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(atoms.fullscreen, event.detail);
  });
};

const useErrorHandler = (looker, sampleId) => {
  const [error, setError] = useState(null);
  const mimetype = useRecoilValue(selectors.sampleMimeType(sampleId));
  const video = mimetype.startsWith("video/");

  useEventHandler(looker, "error", () =>
    setError(
      <>
        <p>
          The {video ? "video" : "image"} failed to load. The file may not
          exist, or its type ({mimetype}) may be unsupported.
        </p>
        <p>
          {video && (
            <>
              {" "}
              You can use{" "}
              <code>
                <ExternalLink href="https://voxel51.com/docs/fiftyone/api/fiftyone.utils.video.html#fiftyone.utils.video.reencode_videos">
                  fiftyone.utils.video.reencode_videos()
                </ExternalLink>
              </code>{" "}
              to re-encode videos in a supported format.
            </>
          )}
        </p>
      </>
    )
  );

  return error;
};

interface LookerProps {
  lookerRef?: MutableRefObject<any>;
  modal: boolean;
  onClose?: EventCallback;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onNext?: EventCallback;
  onPrevious?: EventCallback;
  onSelectLabel?: EventCallback;
  sampleId: string;
  style?: React.CSSProperties;
}

const Looker = ({
  lookerRef,
  modal,
  onClose,
  onClick,
  onNext,
  onPrevious,
  onSelectLabel,
  sampleId,
  style,
}: LookerProps) => {
  const [id] = useState(() => uuid());
  let sample = useRecoilValue(atoms.sample(sampleId));
  const sampleSrc = useRecoilValue(selectors.sampleSrc(sampleId));
  const options = useRecoilValue(modal ? lookerModalOptions : lookerOptions);
  const activeLabels = useRecoilValue(
    modal ? labelAtoms.activeModalFields : labelAtoms.activeFields
  );
  const metadata = useRecoilValue(atoms.sampleMetadata(sampleId));
  const theme = useTheme();
  const lookerConstructor = useRecoilValue(lookerType(sampleId));
  const initialRef = useRef<boolean>(true);

  const [looker] = useState(
    () =>
      new lookerConstructor(
        sample,
        {
          src: sampleSrc,
          thumbnail: !modal,
          dimensions: [metadata.width, metadata.height],
          frameRate: metadata.frameRate,
          frameNumber: sample.frame_number,
          sampleId,
        },
        {
          activeLabels,
          ...options,
          hasNext: Boolean(onNext),
          hasPrevious: Boolean(onPrevious),
        }
      )
  );

  useEffect(() => {
    !modal && console.log(options);
    !initialRef.current && looker.updateOptions({ ...options });
  }, [options]);

  useEffect(() => {
    !initialRef.current && looker.updateSample(sample);
  }, [sample]);

  useEffect(() => {
    return () => modal && looker && looker.destroy();
  }, [looker]);

  lookerRef && (lookerRef.current = looker);

  const error = useErrorHandler(looker, sampleId);
  modal && useEventHandler(looker, "options", useLookerOptionsUpdate());
  modal && useEventHandler(looker, "fullscreen", useFullscreen());
  onNext && useEventHandler(looker, "next", onNext);
  onPrevious && useEventHandler(looker, "previous", onPrevious);
  onClose && useEventHandler(looker, "close", onClose);
  onSelectLabel && useEventHandler(looker, "select", onSelectLabel);
  useEffect(() => {
    initialRef.current = false;
  }, []);

  useEffect(() => looker.attach(id), [id]);

  return (
    <div
      id={id}
      style={{
        width: "100%",
        height: "100%",
        background: theme.backgroundDark,
        ...style,
      }}
      onClick={onClick}
    >
      {error && (
        <InfoWrapper>
          <Warning classes={{ root: "error" }} />
          {!modal ? null : <div>{error}</div>}{" "}
        </InfoWrapper>
      )}
      {modal && <TooltipInfo looker={looker} />}
    </div>
  );
};

export default React.memo(Looker);
