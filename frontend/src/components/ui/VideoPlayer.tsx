"use client";
import { useState, useRef } from "react";

interface VideoPlayerProps {
  videoUrl: string;
  className?: string;
}

const ratioStyles: Record<string, React.CSSProperties> = {
  "9:16": { width: "240px", maxHeight: "420px" },
  "16:9": { width: "100%", maxHeight: "300px" },
  "1:1": { width: "300px", maxHeight: "300px" },
  "4:3": { width: "320px", maxHeight: "240px" },
  "21:9": { width: "100%", maxHeight: "200px" },
};

export default function VideoPlayer({ videoUrl, className = "" }: VideoPlayerProps) {
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const ratio = video.videoWidth / video.videoHeight;
      if (ratio > 1.7) setAspectRatio("16:9");
      else if (ratio > 1.3) setAspectRatio("4:3");
      else if (ratio > 0.9 && ratio < 1.1) setAspectRatio("1:1");
      else if (ratio > 2.1) setAspectRatio("21:9");
      else setAspectRatio("9:16");
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  return (
    <div
      className={className}
      style={{
        borderRadius: "12px",
        overflow: "hidden",
        background: "#000",
        marginTop: "12px",
        display: "flex",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        playsInline
        loop
        onClick={togglePlay}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        style={{
          ...ratioStyles[aspectRatio],
          display: "block",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      />

      {!isPlaying && (
        <div
          onClick={togglePlay}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.3)",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              style={{ width: 24, height: 24, color: "white", marginLeft: 2 }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          position: "absolute",
          bottom: 0,
          background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
        }}
      >
        <span style={{ fontSize: "11px", color: "#a1a1aa" }}>
          {aspectRatio}
        </span>
        <a
          href={videoUrl}
          download
          target="_blank"
          rel="noopener"
          style={{
            fontSize: "12px",
            color: "#6366f1",
            textDecoration: "none",
            padding: "4px 10px",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "6px",
          }}
        >
          Download
        </a>
      </div>
    </div>
  );
}
