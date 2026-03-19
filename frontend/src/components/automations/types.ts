export interface Automation {
  id: number;
  name: string;
  type: string;
  status: string;
  schedule: string | null;
  config: string;
  created_at: string;
}

export interface TabProps {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}
