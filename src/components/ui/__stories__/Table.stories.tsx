import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table";

const meta: Meta<typeof Table> = {
  title: "Design system/Table",
};
export default meta;
type Story = StoryObj<typeof Table>;

const rows = [
  { id: "cm1", label: "Numerical Reasoning", status: "operational" },
  { id: "cm2", label: "Reading Comprehension", status: "confirmed" },
  { id: "cm3", label: "Spatial Reasoning", status: "draft" },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Student Models</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Label</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs">{row.id}</TableCell>
            <TableCell>{row.label}</TableCell>
            <TableCell>{row.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
