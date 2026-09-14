// src/components/ui/DashboardLayout.jsx
import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// export default function DashboardLayout({ title, tabs }) {
//   const role = localStorage.getItem("role");

//   // Filter tabs based on what the role can view
//   const visibleTabs = tabs?.filter((tab) => {
//     // tab.entity (add this in tab definitions)
//     if (!tab.entity) return true;
//     return can(role, "view", tab.entity);
//   });

//   return (
//     <div className="p-6">
//       <h1 className="text-2xl font-bold mb-4">{title}</h1>

//       <Tabs defaultValue={visibleTabs[0]?.id} className="w-full">
//         <TabsList className="mb-4 flex flex-wrap gap-2">
//           {visibleTabs.map((tab) => (
//             <TabsTrigger key={tab.id} value={tab.id}>
//               {tab.label}
//             </TabsTrigger>
//           ))}
//         </TabsList>

//         {visibleTabs.map((tab) => (
//           <TabsContent key={tab.id} value={tab.id}>
//             <Card>
//               <CardHeader>
//                 <CardTitle>{tab.label}</CardTitle>
//               </CardHeader>
//               <CardContent>{tab.content}</CardContent>
//             </Card>
//           </TabsContent>
//         ))}
//       </Tabs>
//     </div>
//   );
// }

export default function DashboardLayout({ title, tabs = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const fallbackId = tabs[0]?.id || "";
  const urlTab =
    tabFromUrl && tabs.some((t) => t.id === tabFromUrl) ? tabFromUrl : fallbackId;
  const [activeTab, setActiveTab] = useState(urlTab);

  useEffect(() => {
    setActiveTab(urlTab);
  }, [urlTab]);

  if (!tabs.length) return <div className="p-6">No content available</div>;

  const selectTab = (id) => {
    setActiveTab(id);
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4">{title}</h1>

      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList className="flex bg-gray-100 p-1 rounded-lg space-x-2">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className={`px-4 py-2 rounded ${
                activeTab === t.id
                  ? "bg-blue-600 text-white"
                  : "hover:bg-blue-50"
              }`}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((t) => (
          <TabsContent
            key={t.id}
            value={t.id}
            className="mt-4 bg-white border rounded-md p-4 shadow-sm"
          >
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}