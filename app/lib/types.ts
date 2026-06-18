export type Repeat = "never" | "daily" | "weekly" | "monthly" | "custom";

export type TriggerType =
  | "day_of_week"
  | "nth_occurrence"
  | "recipient_domain"
  | "time_of_day";

export type DayOfWeek =
  | "monday" | "tuesday" | "wednesday" | "thursday" | "friday"
  | "saturday" | "sunday" | "weekend" | "weekday";

export type ActionType =
  | "prepend_body"
  | "append_body"
  | "replace_body"
  | "modify_subject"
  | "add_cc";

export type SubjectAction = "prepend" | "append" | "replace";
export type TimeComparison = "before" | "after";

export type ConditionalRule = {
  id: number;
  triggerType: TriggerType;
  dayOfWeek?: DayOfWeek;
  nthOccurrence?: number;
  recipientDomain?: string;
  timeComparison?: TimeComparison;
  timeValue?: string;
  actionType: ActionType;
  actionValue: string;
  subjectAction?: SubjectAction;
};

export type Attachment = {
  id: number;
  name: string;
  size: string;
  type: "file" | "image";
  contentBase64?: string;
  contentType?: string;
};

export type RepeatConfig = {
  interval: number;
  unit: "days" | "weeks" | "months";
  endType: "never" | "after" | "on";
  endCount?: number;
  endDate?: string;
};
