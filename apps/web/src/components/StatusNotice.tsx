interface StatusNoticeProps {
  tone: "neutral" | "success" | "error";
  message: string;
}

export function StatusNotice({ tone, message }: StatusNoticeProps) {
  return <div className={`status-notice status-${tone}`}>{message}</div>;
}
