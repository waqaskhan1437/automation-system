"use client";
import { useState, useRef, useEffect } from "react";

interface VideoPlayerProps {
  src: string;
  aspectRatio?: string;
  className?: string;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

const ASPECT_RATIOS: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-[16/9]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "21:9": "aspect-[21/9]",
};

export function UniversalVideoPlayer({ src, aspectRatio = "9:16", className = "", onEnded, onError }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>(aspectRatio);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setIsLoading(false);
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      if (width && height) {
        const ratio = width / height;
        const closest = Object.keys(ASPECT_RATIOS).reduce((prev, curr) => {
          const [w, h] = curr.split(":").map(Number);
          const currentRatio = w / h;
          return Math.abs(currentRatio - ratio) < Math.abs(prev.ratio - ratio) 
            ? { ratio: currentRatio, key: curr }
            : prev;
        }, { ratio: 9/16, key: "9:16" });
        
        setVideoAspectRatio(closest.key);
      }
    };

    const handleError = () => {
      setIsLoading(false);
      setError("Failed to load video");
      onError?.(new Error("Failed to load video"));
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      video.removeEventListener("ended", handleEnded);
    };
  }, [onEnded, onError]);

  const handlePlay = () => {
    const video = videoRef.current;
    if (video) {
      video.play();
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden ${ASPECT_RATIOS[videoAspectRatio] || "aspect-[9/16]"} ${className}`}>
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        playsInline
        onClick={togglePlay}
      />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        </div>
      )}
      
      {!isLoading && !error && !isPlaying && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center group cursor-pointer bg-black/30"
        >
          <div className="w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-all transform group-hover:scale-110">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      )}
      
      {isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <button onClick={handlePause} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </button>
            <span className="text-white text-xs">{videoAspectRatio}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface VideoPreviewProps {
  jobId: number;
  githubRunUrl?: string | null;
  aspectRatio?: string;
  className?: string;
  onPlay?: () => void;
}

export function VideoPreview({ jobId, githubRunUrl, aspectRatio = "9:16", className = "", onPlay }: VideoPreviewProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  
  if (showPlayer) {
    return (
      <div className={className}>
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setShowPlayer(false)}
                className="p-2 text-white/60 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-black rounded-xl overflow-hidden">
              <p className="text-center text-white/40 py-8">Video player requires artifact download</p>
              {githubRunUrl && (
                <div className="p-4 text-center">
                  <a
                    href={githubRunUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-indigo-400 hover:underline"
                  >
                    View on GitHub →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setShowPlayer(true); onPlay?.(); }}
      className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1a2e] to-[#0d0d14] rounded-xl relative group cursor-pointer ${className}`}
    >
      <div className="w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-all">
        <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </button>
  );
}