"use client";
import { useState } from "react";

export default function CreateImageAutomation() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [imageSource, setImageSource] = useState<"url" | "placeholder">("url");
  const [imageUrl, setImageUrl] = useState("");
  const [placeholderText, setPlaceholderText] = useState("");
  const [bgColor, setBgColor] = useState("#000000");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState("48");
  const [width, setWidth] = useState("1080");
  const [height, setHeight] = useState("1080");
  const [watermarkText, setWatermarkText] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [schedule, setSchedule] = useState("once");
  const [creating, setCreating] = useState(false);

  const allPlatforms = ["instagram", "facebook", "x"];

  const handleCreate = async () => {
    setCreating(true);
    const config = {
      image_source: imageSource,
      image_url: imageUrl || null,
      placeholder_text: placeholderText || null,
      image_config: {
        width: parseInt(width),
        height: parseInt(height),
        background_color: bgColor,
        text_color: textColor,
        text_size: parseInt(textSize),
        watermark_text: watermarkText || null,
        watermark_position: "bottomright",
      },
      platforms,
    };

    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: "image",
          config: JSON.stringify(config),
          schedule: schedule === "once" ? null : schedule,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Image automation created!");
        window.location.href = "/automations";
      } else {
        alert("Failed: " + data.error);
      }
    } catch (err) {
      alert("Failed to create automation");
    }
    setCreating(false);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Create Image Automation</h2>
        <p className="text-[#a1a1aa] mt-1">Set up your image generation pipeline</p>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                s === step
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                  : s < step
                  ? "bg-[#10b981] text-white"
                  : "glass-button"
              }`}
            >
              {s}
            </div>
            {s < 3 && (
              <div className={`w-16 h-0.5 ${s < step ? "bg-[#10b981]" : "bg-[rgba(255,255,255,0.1)]"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="glass-card p-8">
        {step === 1 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Basic Info & Source</h3>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-2">Automation Name</label>
              <input className="glass-input" placeholder="e.g., Daily Motivational Quote" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-3">Image Source</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setImageSource("url")}
                  className={`px-5 py-3 rounded-xl text-sm font-medium ${
                    imageSource === "url" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"
                  }`}
                >
                  Image URL
                </button>
                <button
                  onClick={() => setImageSource("placeholder")}
                  className={`px-5 py-3 rounded-xl text-sm font-medium ${
                    imageSource === "placeholder" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"
                  }`}
                >
                  Text Placeholder
                </button>
              </div>
            </div>
            {imageSource === "url" ? (
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Image URL</label>
                <input className="glass-input" placeholder="https://example.com/image.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Placeholder Text</label>
                <textarea
                  className="glass-input min-h-[100px] resize-none"
                  placeholder="Enter text for placeholder image..."
                  value={placeholderText}
                  onChange={(e) => setPlaceholderText(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Image Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Width (px)</label>
                <input className="glass-input" type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Height (px)</label>
                <input className="glass-input" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Background Color</label>
                <div className="flex gap-2">
                  <input type="color" className="w-12 h-10 rounded-lg border border-[rgba(255,255,255,0.1)] bg-transparent cursor-pointer" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                  <input className="glass-input flex-1" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Text Color</label>
                <div className="flex gap-2">
                  <input type="color" className="w-12 h-10 rounded-lg border border-[rgba(255,255,255,0.1)] bg-transparent cursor-pointer" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                  <input className="glass-input flex-1" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Text Size (px)</label>
                <input className="glass-input" type="number" value={textSize} onChange={(e) => setTextSize(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Watermark Text</label>
                <input className="glass-input" placeholder="@yourhandle" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
              </div>
            </div>
            <div className="glass-card p-4">
              <p className="text-sm text-[#a1a1aa] mb-2">Preview</p>
              <div
                className="w-full h-48 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: bgColor }}
              >
                <p style={{ color: textColor, fontSize: `${Math.min(parseInt(textSize), 24)}px` }}>
                  {placeholderText || "Your text here"}
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Platforms & Schedule</h3>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-3">Target Platforms</label>
              <div className="flex flex-wrap gap-3">
                {allPlatforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${
                      platforms.includes(p) ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-2">Schedule</label>
              <select className="glass-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                <option value="once">Run Once (Manual)</option>
                <option value="0 */6 * * *">Every 6 Hours</option>
                <option value="0 0 * * *">Daily</option>
                <option value="0 0 * * 0">Weekly</option>
              </select>
            </div>
            <div className="glass-card p-4 space-y-3">
              <h4 className="font-semibold">Review</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="text-[#a1a1aa]">Name:</p><p>{name || "-"}</p>
                <p className="text-[#a1a1aa]">Source:</p><p className="capitalize">{imageSource}</p>
                <p className="text-[#a1a1aa]">Size:</p><p>{width}x{height}</p>
                <p className="text-[#a1a1aa]">Platforms:</p><p>{platforms.join(", ") || "-"}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className={`glass-button ${step === 1 ? "opacity-30 pointer-events-none" : ""}`}
          >
            Previous
          </button>
          {step < 3 ? (
            <button onClick={() => setStep((s) => Math.min(3, s + 1))} className="glass-button-primary">
              Next
            </button>
          ) : (
            <button onClick={handleCreate} disabled={creating} className="glass-button-primary">
              {creating ? "Creating..." : "Create Automation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
