import React from "react";
import HomeAnnouncements from "./HomeAnnouncements";

/** First RoleWorkbench group for every role — default landing after login. */
export function homeWorkbenchGroup() {
  return {
    id: "home",
    label: "Home",
    tabs: [
      {
        id: "home",
        label: "Announcements",
        content: <HomeAnnouncements />,
      },
    ],
  };
}
