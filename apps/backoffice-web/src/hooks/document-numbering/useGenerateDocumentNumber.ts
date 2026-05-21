import { useMutation } from "@tanstack/react-query";
import { DocumentType } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";

export interface GenerateDocumentNumberParams {
  documentType: DocumentType;
  branchId?: string;
}

export function useGenerateDocumentNumber() {
  return useMutation({
    mutationKey: ["document-numbers", "generate"],
    mutationFn: async ({
      documentType,
      branchId,
    }: GenerateDocumentNumberParams) =>
      requireErpData(
        await erpApi.POST<string>("/document-numbers/generate", {
          body:
            branchId !== undefined
              ? { documentType, branchId }
              : { documentType },
        }),
      ),
  });
}
