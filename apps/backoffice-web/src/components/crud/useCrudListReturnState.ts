import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ColumnFilter } from "../table/pagination.dto";
import {
  navigateToCrudEdit,
  parseCrudListLocationState,
  type CrudListReturnState,
} from "./crudListNavigation";

interface UseCrudListReturnStateOptions {
  entityKey: string | undefined;
  initialSort?: { sortBy: string; sortOrder: "asc" | "desc" };
  onEntityReset?: () => void;
}

export function useCrudListReturnState({
  entityKey,
  initialSort,
  onEntityReset,
}: UseCrudListReturnStateOptions) {
  const navigate = useNavigate();
  const location = useLocation();

  const mountReturnRef = useRef(
    parseCrudListLocationState(location.state)?.crudListReturn,
  );
  const skipRestoreOnMountRef = useRef(Boolean(mountReturnRef.current));

  const [page, setPage] = useState(() => mountReturnRef.current?.page ?? 1);
  const [pageSize, setPageSize] = useState(
    () => mountReturnRef.current?.pageSize ?? 20,
  );
  const [sortBy, setSortBy] = useState<string | undefined>(
    () => mountReturnRef.current?.sortBy ?? initialSort?.sortBy,
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    () => mountReturnRef.current?.sortOrder ?? initialSort?.sortOrder ?? "desc",
  );
  const [search, setSearch] = useState(() => mountReturnRef.current?.search ?? "");
  const [searchInput, setSearchInput] = useState(
    () => mountReturnRef.current?.searchInput ?? "",
  );
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >(() => mountReturnRef.current?.columnFilters ?? {});

  useEffect(() => {
    const returned = parseCrudListLocationState(location.state)?.crudListReturn;
    if (returned) {
      if (!skipRestoreOnMountRef.current) {
        setPage(returned.page);
        setPageSize(returned.pageSize);
        setSortBy(returned.sortBy ?? initialSort?.sortBy);
        setSortOrder(returned.sortOrder ?? initialSort?.sortOrder ?? "desc");
        setSearch(returned.search);
        setSearchInput(returned.searchInput);
        setColumnFilters(returned.columnFilters);
      }
      skipRestoreOnMountRef.current = false;
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    skipRestoreOnMountRef.current = false;
    setPage(1);
    setPageSize(20);
    setSortBy(initialSort?.sortBy);
    setSortOrder(initialSort?.sortOrder ?? "desc");
    setSearch("");
    setSearchInput("");
    setColumnFilters({});
    onEntityReset?.();
  }, [entityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildListReturnState = useCallback((): CrudListReturnState => {
    return {
      page,
      pageSize,
      sortBy,
      sortOrder,
      search,
      searchInput,
      columnFilters,
    };
  }, [page, pageSize, sortBy, sortOrder, search, searchInput, columnFilters]);

  const goToEdit = useCallback(
    (id: string) => {
      if (!entityKey) return;
      navigateToCrudEdit(navigate, entityKey, id, buildListReturnState());
    },
    [entityKey, navigate, buildListReturnState],
  );

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    search,
    setSearch,
    searchInput,
    setSearchInput,
    columnFilters,
    setColumnFilters,
    goToEdit,
  };
}
