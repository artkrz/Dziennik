const BASE = "/api/accounts";

export interface Account {
  id: number;
  label: string;
  login: string;
}

export interface TimetableLesson {
  subject: string;
  teacher: string;
  room: string;
  time: string;
}

export interface Timetable {
  hours: string[];
  table: Record<string, (TimetableLesson | null)[]>;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export function listAccounts(): Promise<Account[]> {
  return fetch(BASE).then((res) => asJson<Account[]>(res));
}

export function addAccount(label: string, login: string, password: string): Promise<Account> {
  return fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, login, password }),
  }).then((res) => asJson<Account>(res));
}

export async function deleteAccount(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete account ${id}`);
}

export function getTimetable(id: number, from?: string, to?: string): Promise<Timetable> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return fetch(`${BASE}/${id}/timetable${query ? `?${query}` : ""}`).then((res) =>
    asJson<Timetable>(res)
  );
}

export interface Message {
  id: number;
  user: string;
  title: string;
  date: string;
  read: boolean;
}

export interface MessageDetail {
  id: number;
  title: string;
  user: string;
  date: string;
  content: string;
}

export function listMessages(id: number): Promise<Message[]> {
  return fetch(`${BASE}/${id}/messages`).then((res) => asJson<Message[]>(res));
}

export function getMessage(id: number, messageId: number): Promise<MessageDetail> {
  return fetch(`${BASE}/${id}/messages/${messageId}`).then((res) => asJson<MessageDetail>(res));
}

export interface SubjectGrade {
  id: number;
  info: string;
  value: string;
}

export interface SubjectSemester {
  grades: SubjectGrade[];
  tempAverage: number;
  average: number;
}

export interface SubjectGrades {
  name: string;
  semester: SubjectSemester[];
  tempAverage: number;
  average: number;
}

export interface AbsenceDay {
  date: string;
  table: ({ type: string; id: number } | null)[];
  info: string[];
}

export interface Absences {
  semesters: Record<string, AbsenceDay[]>;
}

export interface AgendaEvent {
  id: number;
  day: string;
  title: string;
}

export function getGrades(id: number): Promise<SubjectGrades[]> {
  return fetch(`${BASE}/${id}/grades`).then((res) => asJson<SubjectGrades[]>(res));
}

export function getAbsences(id: number): Promise<Absences> {
  return fetch(`${BASE}/${id}/absences`).then((res) => asJson<Absences>(res));
}

export function getAgenda(id: number, month?: number, year?: number): Promise<AgendaEvent[]> {
  const params = new URLSearchParams();
  if (month) params.set("month", String(month));
  if (year) params.set("year", String(year));
  const query = params.toString();
  return fetch(`${BASE}/${id}/agenda${query ? `?${query}` : ""}`).then((res) =>
    asJson<AgendaEvent[]>(res)
  );
}

export interface AgendaEventDetail {
  lesson?: string;
  date?: string;
  lessonNumber?: string;
  teacher?: string;
  type?: string;
  subject?: string;
  room?: string;
  description?: string;
  added?: string;
  timespan?: string;
}

export function getAgendaEvent(id: number, eventId: number): Promise<AgendaEventDetail> {
  return fetch(`${BASE}/${id}/agenda/${eventId}`).then((res) => asJson<AgendaEventDetail>(res));
}
