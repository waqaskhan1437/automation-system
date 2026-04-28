"use client";

import type { Automation } from "../types";
import ImageAutomationEditor from "./ImageAutomationEditor";

interface Props {
  editData: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ImageAutomationModal({ editData, onClose, onSaved }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="w-full max-w-[1400px] h-[85vh]" onClick={(event) => event.stopPropagation()}>
        <ImageAutomationEditor editData={editData} onSaved={onSaved} onClose={onClose} />
      </div>
    </div>
  );
}
