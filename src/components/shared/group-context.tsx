"use client";

import { createContext, useContext, useEffect } from "react";

interface GroupContextValue {
  groupId: string;
  groupName: string;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({
  groupId,
  groupName,
  children,
}: GroupContextValue & { children: React.ReactNode }) {
  useEffect(() => {
    document.cookie = `lastGroupId=${groupId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  }, [groupId]);

  return (
    <GroupContext.Provider value={{ groupId, groupName }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  return useContext(GroupContext);
}
