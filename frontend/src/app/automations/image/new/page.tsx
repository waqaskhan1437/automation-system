"use client";

import { useRouter } from "next/navigation";
import ImageAutomationEditor from "@/components/automations/image/ImageAutomationEditor";

export default function CreateImageAutomationPage() {
  const router = useRouter();

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ImageAutomationEditor
        editData={null}
        onSaved={() => {
          router.push("/automations");
        }}
      />
    </div>
  );
}
