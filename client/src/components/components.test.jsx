import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../services/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

let mockUser = { id: 1, role: "patient", name: "Uma UI" };
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ user: mockUser }) }));

import { api } from "../services/api.js";
import { ToastProvider } from "./ui/ToastContext.jsx";
import BookingModal from "./Appointment/BookingModal.jsx";
import AppointmentCard from "./Appointment/AppointmentCard.jsx";
import AssistantSearch from "./Doctor/AssistantSearch.jsx";

const wrap = (ui) => render(<ToastProvider>{ui}</ToastProvider>);
const future = new Date(Date.now() + 3 * 86400000);
const futureYmd = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
const SLOTS = [
  { startsAt: "2030-01-07T09:00:00.000Z", endsAt: "2030-01-07T09:30:00.000Z" },
  { startsAt: "2030-01-07T09:30:00.000Z", endsAt: "2030-01-07T10:00:00.000Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { id: 1, role: "patient", name: "Uma UI" };
});

describe("BookingModal", () => {
  const doctor = { id: 7, name: "Dr Ravi", specialization: "Dermatologist", fee: 800 };

  it("only lets the patient confirm after choosing a real free slot, then books it", async () => {
    api.get.mockResolvedValue({ data: { timezone: "Asia/Kolkata", date: futureYmd, slots: SLOTS } });
    api.post.mockResolvedValue({ data: { appointment: { id: 99 } } });
    const onBooked = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<BookingModal doctor={doctor} onClose={onClose} onBooked={onBooked} />);

    const confirm = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText("Date"), futureYmd);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/doctors/7/slots", { params: { date: futureYmd } }));
    const options = await screen.findAllByRole("radio");
    expect(options).toHaveLength(2);
    expect(screen.getByText(/clinic is in Asia\/Kolkata/)).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    await user.click(options[1]);
    expect(options[1]).toHaveAttribute("aria-checked", "true");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/appointments", { doctorId: 7, startsAt: SLOTS[1].startsAt, endsAt: SLOTS[1].endsAt }));
    expect(onBooked).toHaveBeenCalledWith({ id: 99 });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an empty state when a day has no free slots", async () => {
    api.get.mockResolvedValue({ data: { timezone: "UTC", slots: [] } });
    const user = userEvent.setup();
    wrap(<BookingModal doctor={doctor} onClose={() => {}} onBooked={() => {}} />);
    await user.type(screen.getByLabelText("Date"), futureYmd);
    expect(await screen.findByText(/no free times on this day/i)).toBeInTheDocument();
  });

  it("surfaces the server error if the slot was taken meanwhile", async () => {
    api.get.mockResolvedValue({ data: { timezone: "UTC", slots: SLOTS } });
    api.post.mockRejectedValue({ response: { data: { error: "This slot is already booked" } } });
    const user = userEvent.setup();
    wrap(<BookingModal doctor={doctor} onClose={() => {}} onBooked={() => {}} />);
    await user.type(screen.getByLabelText("Date"), futureYmd);
    await user.click((await screen.findAllByRole("radio"))[0]);
    await user.click(screen.getByRole("button", { name: /confirm booking/i }));
    expect(await screen.findByText("This slot is already booked")).toBeInTheDocument();
  });

  it("reschedules an existing appointment with PATCH", async () => {
    api.get.mockResolvedValue({ data: { timezone: "UTC", slots: SLOTS } });
    api.patch.mockResolvedValue({ data: { appointment: { id: 5 } } });
    const user = userEvent.setup();
    wrap(<BookingModal appointment={{ id: 5, doctor_id: 7, doctor_name: "Dr Ravi" }} onClose={() => {}} onBooked={() => {}} />);
    expect(screen.getByText(/reschedule with dr ravi/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Date"), futureYmd);
    await user.click((await screen.findAllByRole("radio"))[0]);
    await user.click(screen.getByRole("button", { name: /confirm new time/i }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/appointments/5/reschedule", { startsAt: SLOTS[0].startsAt, endsAt: SLOTS[0].endsAt }));
  });
});

describe("AppointmentCard", () => {
  const base = { id: 3, status: "scheduled", starts_at: "2030-01-07T09:00:00Z", ends_at: "2030-01-07T09:30:00Z", specialization: "Cardiology", patient_name: "Uma" };

  it("patient cancel needs a second confirming click (no browser dialog)", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    wrap(<AppointmentCard appointment={base} onCancel={onCancel} onReschedule={() => {}} />);
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /keep appointment/i }));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await user.click(screen.getByRole("button", { name: /yes, cancel it/i }));
    expect(onCancel).toHaveBeenCalledWith(base);
  });

  it("hides cancel/reschedule for finished appointments", () => {
    wrap(<AppointmentCard appointment={{ ...base, status: "completed" }} onCancel={() => {}} onReschedule={() => {}} />);
    expect(screen.queryByRole("button", { name: /cancel|reschedule/i })).toBeNull();
  });

  it("offers Reschedule for open appointments", async () => {
    const onReschedule = vi.fn();
    const user = userEvent.setup();
    wrap(<AppointmentCard appointment={base} onCancel={() => {}} onReschedule={onReschedule} />);
    await user.click(screen.getByRole("button", { name: /reschedule/i }));
    expect(onReschedule).toHaveBeenCalledWith(base);
  });

  it("doctor sees a Documents action for the patient", async () => {
    mockUser = { id: 2, role: "doctor", name: "Dr Ravi" };
    const onDocuments = vi.fn();
    const user = userEvent.setup();
    wrap(<AppointmentCard appointment={base} onDocuments={onDocuments} onStatusChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /documents/i }));
    expect(onDocuments).toHaveBeenCalledWith(base);
  });
});

describe("AssistantSearch", () => {
  it("turns the AI filters into a doctor search", async () => {
    api.post.mockResolvedValue({ data: { filters: { specialization: "Cardiologist", location: "Pune", maxFee: 500, availableDay: "saturday" } } });
    const onSearch = vi.fn();
    const user = userEvent.setup();
    wrap(<AssistantSearch onSearch={onSearch} />);
    const ask = screen.getByRole("button", { name: /ask assistant/i });
    expect(ask).toBeDisabled();
    await user.type(screen.getByLabelText(/describe the doctor/i), "heart doctor in pune");
    await user.click(ask);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/assistant/query", { message: "heart doctor in pune" }));
    expect(onSearch).toHaveBeenCalledWith({ specialization: "Cardiologist", location: "Pune", maxFee: 500 });
    expect(screen.getByRole("status")).toHaveTextContent("specialization: Cardiologist");
  });

  it("falls back gracefully when the AI service is down", async () => {
    api.post.mockRejectedValue({ response: { status: 502 } });
    const onSearch = vi.fn();
    const user = userEvent.setup();
    wrap(<AssistantSearch onSearch={onSearch} />);
    await user.type(screen.getByLabelText(/describe the doctor/i), "heart doctor");
    await user.click(screen.getByRole("button", { name: /ask assistant/i }));
    expect(await screen.findByText(/assistant is unavailable/i)).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });
});
