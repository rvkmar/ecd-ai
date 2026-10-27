import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import SessionForm from "../SessionForm.jsx";

vi.mock("../../../api/queries/policies", () => ({
  usePolicies: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../../api/queries/deliveryModels", () => ({
  useDeliveryModels: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../../api/queries/assemblyModels", () => ({
  useAssemblyModels: () => ({ data: [], isLoading: false }),
}));

const students = [
  { id: "stu1", name: "Pat", username: "pat1", classId: "6A" },
  { id: "stud1", name: "stud1", username: "stud1", classId: "6A" },
];
const cohorts = [{ id: "6A", name: "Class 6A", studentIds: ["stu1", "stud1"] }];
const tasks = [{ id: "t1", questionId: "Q1" }];

describe("SessionForm student / cohort assignment", () => {
  it("ships a student picker, Student with ID, and cohort control", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../SessionForm.jsx"), "utf8");
    expect(src).toMatch(/student-id-input/);
    expect(src).toMatch(/Student with ID/);
    expect(src).toMatch(/cohort-select/);
    expect(src).toMatch(/studentIds/);
  });

  it("lets staff pick a roster student and persist studentIds", () => {
    const onSave = vi.fn();
    render(
      <SessionForm
        students={students}
        cohorts={cohorts}
        tasks={tasks}
        onSave={onSave}
        notify={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText(/stud1/));
    fireEvent.click(screen.getByLabelText(/Q1/));
    fireEvent.click(screen.getByRole("button", { name: /Save Session/ }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "stud1",
        studentIds: ["stud1"],
      })
    );
  });

  it("accepts Student with ID when the roster is empty", () => {
    const onSave = vi.fn();
    render(
      <SessionForm students={[]} cohorts={[]} tasks={tasks} onSave={onSave} notify={() => {}} />
    );
    fireEvent.change(screen.getByTestId("student-id-input"), { target: { value: "stud1" } });
    fireEvent.click(screen.getByRole("button", { name: /Add ID/ }));
    expect(screen.getByTestId("selected-assignees")).toHaveTextContent("stud1");
    fireEvent.click(screen.getByLabelText(/Q1/));
    fireEvent.click(screen.getByRole("button", { name: /Save Session/ }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "stud1",
        studentIds: ["stud1"],
      })
    );
  });

  it("can assign a cohort of students", () => {
    const onSave = vi.fn();
    render(
      <SessionForm
        students={students}
        cohorts={cohorts}
        tasks={tasks}
        onSave={onSave}
        notify={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText("Cohort"));
    fireEvent.change(screen.getByTestId("cohort-select"), { target: { value: "6A" } });
    fireEvent.click(screen.getByLabelText(/Q1/));
    fireEvent.click(screen.getByRole("button", { name: /Save Session/ }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        cohortId: "6A",
      })
    );
  });
});
