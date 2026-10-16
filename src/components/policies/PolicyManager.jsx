import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PolicyBuilder } from "./PolicyBuilder";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { useAuth } from "@/auth/AuthProvider";
import { usePolicies, useDeletePolicy } from "@/api/queries/policies";

export function PolicyManager() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [editPolicy, setEditPolicy] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  // Previously read localStorage.getItem("role") with a "|| admin" fallback.
  // Nothing ever wrote that localStorage key, so this always fell back to
  // "admin" for every user — a fail-open bug. Now reads the real role from
  // the auth context, with no privileged fallback.
  const { auth } = useAuth() || {};
  const role = auth?.role;

  const { data: policies = [], isLoading: loading } = usePolicies();
  const deletePolicy = useDeletePolicy();

  function handleDelete(id) {
    deletePolicy.mutate(id, {
      // Phase 2 note: the old handler called fetch() and then unconditionally
      // showed a success toast without checking res.ok, so a failed delete
      // still reported success. useMutation's onSuccess/onError only fire on
      // the outcome that actually happened, so this fixes that silently.
      onSuccess: () => toast.success("Policy deleted successfully!"),
      onError: (err) => {
        console.error("Error deleting policy:", err);
        toast.error("Failed to delete policy.");
      },
    });
  }

  function confirmDelete(id) {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  }

  function handleEdit(policy) {
    setEditPolicy(policy);
    setShowBuilder(true);
  }

  function handleCreate() {
    setEditPolicy(null);
    setShowBuilder(true);
  }

  function handleSaved() {
    setShowBuilder(false);
  }

  return (
    <Card className="p-4">
      <CardHeader className="flex justify-between items-center">
        <CardTitle>Selection policies</CardTitle>
        {role === "admin" && (
          <Button onClick={handleCreate}>+ New Policy</Button>
          )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <p>Loading policies...</p>
        ) : policies.length === 0 ? (
          <p>No policies created yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell>{p.description || "-"}</TableCell>
                  <TableCell>
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="space-x-2">
                      {role === "admin" ? (
                        <>
                      <Button size="sm" onClick={() => handleEdit(p)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => confirmDelete(p.id)}
                      >
                        Delete
                          </Button>
                        </>
                      ) : (
                        <span className="text-gray-400 text-sm">Read-only</span>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {showBuilder && (
        role === "admin" && (
          <PolicyBuilder
            policy={editPolicy}
            onCancel={() => setShowBuilder(false)}
            onSaved={handleSaved}
          />
        )
      )}

      {/* 🔹 Custom confirmation modal instead of browser confirm */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          handleDelete(pendingDeleteId);
          setConfirmOpen(false);
        }}
        title="Delete Policy"
        message="Are you sure you want to delete this policy? This action cannot be undone."
        confirmClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </Card>
  );
}
