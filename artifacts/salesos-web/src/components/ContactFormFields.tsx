import { useState, useRef, useEffect } from "react";
import { X, Building2, ChevronDown, Plus, Loader2 } from "lucide-react";
import {
  useListCompanies,
  useCreateCompany,
  getListCompaniesQueryKey,
  type Company,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary";

// ---------------------------------------------------------------------------
// CompanyCombobox
// ---------------------------------------------------------------------------
export function CompanyCombobox({
  value,
  valueName,
  onChange,
}: {
  value: string | null;
  valueName: string;
  onChange: (id: string | null, name: string) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState(valueName);
  const [open, setOpen] = useState(false);
  const createCompany = useCreateCompany();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useListCompanies(
    { search: search || undefined },
    { query: { queryKey: getListCompaniesQueryKey({ search: search || undefined }) } },
  );

  const companies: Company[] = data ?? [];
  const exactMatch = companies.some(
    (c) => c.name.toLowerCase() === search.toLowerCase(),
  );
  const showCreate = search.trim().length > 0 && !exactMatch;

  useEffect(() => {
    setSearch(valueName);
  }, [valueName]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [value]);

  const select = (id: string, name: string) => {
    onChange(id, name);
    setSearch(name);
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, "");
    setSearch("");
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!search.trim()) return;
    try {
      const company = await createCompany.mutateAsync({
        data: { name: search.trim() },
      });
      qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      select(company.id, company.name);
    } catch {
      // silently ignore — user can retry
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          placeholder="Search or create company…"
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(null, e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={cn(inputCls, "pl-8 pr-14")}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button type="button" onClick={clear} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
              <X size={12} />
            </button>
          )}
          {isFetching
            ? <Loader2 size={13} className="text-muted-foreground animate-spin" />
            : <ChevronDown size={13} className="text-muted-foreground" />
          }
        </div>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-card-border bg-card shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {companies.length === 0 && !showCreate && !isFetching && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">
                {search ? "No companies found." : "Start typing to search."}
              </div>
            )}
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => select(c.id, c.name)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-muted transition-colors",
                  value === c.id && "bg-primary/10 text-primary",
                )}
              >
                <Building2 size={12} className="text-muted-foreground flex-shrink-0" />
                <span className="truncate">{c.name}</span>
                {c.industry && (
                  <span className="ml-auto text-[11px] text-muted-foreground flex-shrink-0">{c.industry}</span>
                )}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                onMouseDown={handleCreate}
                disabled={createCompany.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-primary/10 text-primary border-t border-card-border transition-colors disabled:opacity-50"
              >
                {createCompany.isPending
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Plus size={12} />
                }
                Create "{search.trim()}"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagsInput
// ---------------------------------------------------------------------------
export function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addTag = (raw: string) => {
    const newTags = raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && !value.includes(t));
    if (newTags.length > 0) onChange([...value, ...newTags]);
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div
      className="min-h-[38px] w-full bg-background border border-input rounded-md px-2 py-1.5 flex flex-wrap gap-1.5 cursor-text focus-within:border-primary transition-colors"
      onClick={() => document.getElementById("tags-input")?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 text-primary"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-primary/70"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        id="tags-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder={value.length === 0 ? "Add tags, press Enter or comma…" : ""}
        className="flex-1 min-w-[120px] bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

// Re-export the input class so pages can stay consistent
export { inputCls };
