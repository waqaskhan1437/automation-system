export interface Automation {
  id: number;
  name: string;
  type: string;
  status: string;
  schedule: string | null;
  config: string;
  next_run: string | null;
  last_run: string | null;
  created_at: string;
}

export interface TabProps {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}
