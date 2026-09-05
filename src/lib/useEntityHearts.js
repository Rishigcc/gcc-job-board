import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

export function useEntityHearts(table, idColumn, userId, entityIds) {
  const [heartRows, setHeartRows] = useState([]);
  const [busyIds, setBusyIds] = useState(new Set());

  const idsKey = JSON.stringify(entityIds);

  useEffect(() => {
    if (entityIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHeartRows([]);
      return;
    }

    const loadHearts = async () => {
      const { data, error } = await supabase
        .from(table)
        .select(`${idColumn}, user_id`)
        .in(idColumn, entityIds);

      if (error) {
        console.error(`Error loading hearts from ${table}:`, error);
        return;
      }

      setHeartRows(data);
    };

    loadHearts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const heartCounts = useMemo(() => {
    const counts = {};
    for (const row of heartRows) {
      counts[row[idColumn]] = (counts[row[idColumn]] || 0) + 1;
    }
    return counts;
  }, [heartRows, idColumn]);

  const heartedByMe = useMemo(() => {
    if (!userId) return new Set();
    return new Set(
      heartRows
        .filter((row) => row.user_id === userId)
        .map((row) => row[idColumn])
    );
  }, [heartRows, userId, idColumn]);

  const toggleHeart = async (entityId) => {
    if (!userId || busyIds.has(entityId)) return;

    setBusyIds((prev) => new Set(prev).add(entityId));

    const alreadyHearted = heartedByMe.has(entityId);

    setHeartRows((prev) =>
      alreadyHearted
        ? prev.filter(
            (row) => !(row[idColumn] === entityId && row.user_id === userId)
          )
        : [...prev, { [idColumn]: entityId, user_id: userId }]
    );

    if (alreadyHearted) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq(idColumn, entityId)
        .eq("user_id", userId);

      if (error) {
        console.error(`Error removing heart from ${table}:`, error);
        setHeartRows((prev) => [
          ...prev,
          { [idColumn]: entityId, user_id: userId },
        ]);
      }
    } else {
      const { error } = await supabase
        .from(table)
        .insert({ [idColumn]: entityId, user_id: userId });

      if (error && error.code !== "23505") {
        console.error(`Error adding heart to ${table}:`, error);
        setHeartRows((prev) =>
          prev.filter(
            (row) => !(row[idColumn] === entityId && row.user_id === userId)
          )
        );
      }
    }

    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(entityId);
      return next;
    });
  };

  return { heartCounts, heartedByMe, toggleHeart };
}
