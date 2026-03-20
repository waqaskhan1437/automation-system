import type { TabProps } from "@/lib/types";
import VideoSelection from "./VideoSelection";
import VideoSettings from "./VideoSettings";
import ShortsPerSource from "./ShortsPerSource";
import VideoToggles from "./VideoToggles";
import VideoSummary from "./VideoSummary";

export default function VideoTab({ data, onChange }: TabProps) {
  return (
    <div className="space-y-4">
      <VideoSelection data={data} onChange={onChange} />
      <VideoSettings data={data} onChange={onChange} />
      <ShortsPerSource data={data} onChange={onChange} />
      <VideoToggles data={data} onChange={onChange} />
      <VideoSummary data={data} />
    </div>
  );
}
