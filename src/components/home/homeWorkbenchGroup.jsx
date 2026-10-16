import React from "react";
import HomeAnnouncements from "./HomeAnnouncements";

/** First RoleWorkbench group for every role — default landing after login.
 *  extraTabs sit beside Announcements. Admin passes the policy editors;
 *  other roles stay on announcements only. */
export function homeWorkbenchGroup(extraTabs = []) {
  return {
    id: "home",
    label: "Home",
    tabs: [
      {
        id: "home",
        label: "Announcements",
        content: <HomeAnnouncements />,
      },
      ...extraTabs,
    ],
  };
}
