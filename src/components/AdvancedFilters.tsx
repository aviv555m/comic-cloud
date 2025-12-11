import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";

export interface FilterState {
  search: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  fileTypes: string[];
  readingStatus: string[];
  minRating: number | null;
}

interface AdvancedFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableTags?: { id: string; name: string; color: string }[];
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
}

const FILE_TYPES = ["epub", "pdf", "cbz", "txt"];
const READING_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "reading", label: "Currently Reading" },
  { value: "completed", label: "Completed" },
];
const SORT_OPTIONS = [
  { value: "created_at", label: "Date Added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "reading_progress", label: "Progress" },
  { value: "updated_at", label: "Last Read" },
];

export const AdvancedFilters = ({
  filters,
  onFiltersChange,
  availableTags = [],
  selectedTags = [],
  onTagsChange,
}: AdvancedFiltersProps) => {
  const [open, setOpen] = useState(false);

  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleFileType = (type: string) => {
    const newTypes = filters.fileTypes.includes(type)
      ? filters.fileTypes.filter((t) => t !== type)
      : [...filters.fileTypes, type];
    updateFilter("fileTypes", newTypes);
  };

  const toggleReadingStatus = (status: string) => {
    const newStatuses = filters.readingStatus.includes(status)
      ? filters.readingStatus.filter((s) => s !== status)
      : [...filters.readingStatus, status];
    updateFilter("readingStatus", newStatuses);
  };

  const toggleTag = (tagId: string) => {
    if (!onTagsChange) return;
    const newTags = selectedTags.includes(tagId)
      ? selectedTags.filter((t) => t !== tagId)
      : [...selectedTags, tagId];
    onTagsChange(newTags);
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      sortBy: "created_at",
      sortOrder: "desc",
      fileTypes: [],
      readingStatus: [],
      minRating: null,
    });
    onTagsChange?.([]);
  };

  const activeFilterCount =
    filters.fileTypes.length +
    filters.readingStatus.length +
    (filters.minRating ? 1 : 0) +
    selectedTags.length;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search by title, author, or series..."
          value={filters.search}
          onChange={(e) => updateFilter("search", e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2">
        <Select
          value={`${filters.sortBy}-${filters.sortOrder}`}
          onValueChange={(value) => {
            const [sortBy, sortOrder] = value.split("-") as [string, "asc" | "desc"];
            onFiltersChange({ ...filters, sortBy, sortOrder });
          }}
        >
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={`${option.value}-desc`} value={`${option.value}-desc`}>
                {option.label} (Newest)
              </SelectItem>
            ))}
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={`${option.value}-asc`} value={`${option.value}-asc`}>
                {option.label} (Oldest)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filters</h4>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-auto p-1 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">File Type</Label>
                <div className="flex flex-wrap gap-2">
                  {FILE_TYPES.map((type) => (
                    <Badge
                      key={type}
                      variant={filters.fileTypes.includes(type) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleFileType(type)}
                    >
                      {type.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Reading Status</Label>
                <div className="space-y-2">
                  {READING_STATUSES.map((status) => (
                    <div key={status.value} className="flex items-center gap-2">
                      <Checkbox
                        id={status.value}
                        checked={filters.readingStatus.includes(status.value)}
                        onCheckedChange={() => toggleReadingStatus(status.value)}
                      />
                      <Label htmlFor={status.value} className="text-sm cursor-pointer">
                        {status.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {availableTags.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tags</Label>
                  <div className="flex flex-wrap gap-1">
                    {availableTags.map((tag) => (
                      <Badge
                        key={tag.id}
                        style={{
                          backgroundColor: selectedTags.includes(tag.id)
                            ? tag.color
                            : undefined,
                          color: selectedTags.includes(tag.id) ? "white" : undefined,
                        }}
                        variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">Minimum Rating</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant={filters.minRating === rating ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() =>
                        updateFilter(
                          "minRating",
                          filters.minRating === rating ? null : rating
                        )
                      }
                    >
                      {rating}+
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          {filters.fileTypes.map((type) => (
            <Badge key={type} variant="secondary" className="gap-1">
              {type.toUpperCase()}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => toggleFileType(type)}
              />
            </Badge>
          ))}
          {filters.readingStatus.map((status) => (
            <Badge key={status} variant="secondary" className="gap-1">
              {READING_STATUSES.find((s) => s.value === status)?.label}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => toggleReadingStatus(status)}
              />
            </Badge>
          ))}
          {filters.minRating && (
            <Badge variant="secondary" className="gap-1">
              {filters.minRating}+ stars
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => updateFilter("minRating", null)}
              />
            </Badge>
          )}
          {selectedTags.map((tagId) => {
            const tag = availableTags.find((t) => t.id === tagId);
            return tag ? (
              <Badge
                key={tagId}
                style={{ backgroundColor: tag.color }}
                className="gap-1 text-white"
              >
                {tag.name}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => toggleTag(tagId)}
                />
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
};
