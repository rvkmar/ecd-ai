// Shared PADI TR9 chrome: top-level layer groups, nested tabs.
// Used by Admin, District, Teacher, and Student so the four roles
// share one visual language. ?tab= still selects a leaf (sessionListPath).

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const groupListClass =
  "flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow";
const nestedListClass = "flex flex-wrap gap-2 bg-gray-50 p-2 rounded-xl";
const panelClass = "bg-white rounded-2xl shadow p-6 mt-4";

export default function RoleWorkbench({ title, subtitle, groups = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const allTabs = useMemo(
    () =>
      groups.flatMap((g) =>
        (g.tabs || []).map((t) => ({ ...t, groupId: g.id }))
      ),
    [groups]
  );

  const tabFromUrl = searchParams.get("tab");
  const fallback = allTabs[0];
  const fromUrl = allTabs.find((t) => t.id === tabFromUrl);
  const initial = fromUrl || fallback;

  const [groupId, setGroupId] = useState(initial?.groupId || "");
  const [tabId, setTabId] = useState(initial?.id || "");

  useEffect(() => {
    const next = allTabs.find((t) => t.id === tabFromUrl) || allTabs[0];
    if (!next) return;
    setGroupId(next.groupId);
    setTabId(next.id);
  }, [tabFromUrl, allTabs]);

  if (!groups.length || !allTabs.length) {
    return <div className="p-6">No content available</div>;
  }

  const selectGroup = (id) => {
    const group = groups.find((g) => g.id === id);
    const first = group?.tabs?.[0];
    if (!first) return;
    setGroupId(id);
    setTabId(first.id);
    const next = new URLSearchParams(searchParams);
    next.set("tab", first.id);
    setSearchParams(next, { replace: true });
  };

  const selectTab = (id) => {
    setTabId(id);
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm text-gray-500">{subtitle}</p>
          ) : null}
        </div>

        <Tabs value={groupId} onValueChange={selectGroup} className="space-y-4">
          <TabsList className={groupListClass}>
            {groups.map((g) => (
              <TabsTrigger key={g.id} value={g.id}>
                {g.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {groups.map((g) => (
            <TabsContent key={g.id} value={g.id}>
              <Tabs value={tabId} onValueChange={selectTab}>
                <TabsList className={nestedListClass}>
                  {g.tabs.map((t) => (
                    <TabsTrigger key={t.id} value={t.id}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {g.tabs.map((t) => (
                  <TabsContent key={t.id} value={t.id} className={panelClass}>
                    {t.content}
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
