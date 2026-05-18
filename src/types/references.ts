export type ReviewReferenceStatus = "idle" | "loading" | "ready" | "error";

export type ReviewReferenceOrigin = {
  fileId: string;
  path: string;
  lineNumber: number;
  column: number;
  length: number;
  symbol: string;
  diffPosition: number;
};

export type ReviewReferenceSourceLocation = {
  path: string;
  lineNumber: number;
  column: number;
  length: number;
  lineText: string;
  isDefinition: boolean;
};

export type ReviewReferenceTarget = ReviewReferenceSourceLocation & {
  fileId: string;
  diffPosition: number | null;
  isOrigin: boolean;
};

export type ReviewReferenceLookupResult = {
  kind: "semantic";
  symbol: string;
  references: ReviewReferenceTarget[];
  warnings: string[];
};

export type ReviewReferenceLookupRequest = ReviewReferenceOrigin;
