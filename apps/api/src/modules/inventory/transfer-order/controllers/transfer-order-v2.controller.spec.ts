import { NotFoundException } from "@nestjs/common";
import { ActorContext } from "../../../../common/decorators/actor-context.decorator";
import { SearchGoodsIssueLinesV2Query } from "../../goods-issue/queries/search-goods-issue-lines-v2.query";
import { SearchGoodsReceiptLinesV2Query } from "../../goods-receipt/queries/search-goods-receipt-lines-v2.query";
import { TransferOrderV2Controller } from "./transfer-order-v2.controller";

/** Destination branch of the transfer, reading the source branch's XK. */
const actor: ActorContext = {
  userId: "admin-1",
  organizationId: "org-1",
  branchId: "destination-branch",
  roles: [],
};

const TRANSFER_ID = "33333333-3333-4333-8333-333333333333";
const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

describe("TransferOrderV2Controller", () => {
  let controller: TransferOrderV2Controller;
  let service: {
    getExportGoodsIssue: jest.Mock;
    getImportGoodsReceipt: jest.Mock;
  };
  let queryBus: { execute: jest.Mock };

  // Constructed directly rather than through a testing module: the class-level
  // guards are HTTP concerns and pulling them into the container drags the whole
  // RBAC graph in for a controller with two collaborators.
  beforeEach(() => {
    service = {
      getExportGoodsIssue: jest.fn().mockResolvedValue({ id: ISSUE_ID }),
      getImportGoodsReceipt: jest.fn().mockResolvedValue({ id: RECEIPT_ID }),
    };
    queryBus = { execute: jest.fn().mockResolvedValue({ data: [] }) };
    controller = new TransferOrderV2Controller(
      service as never,
      queryBus as never,
    );
  });

  it("searches the export issue's lines org-scoped, addressed by the transfer", async () => {
    await controller.searchExportGoodsIssueLines(
      TRANSFER_ID,
      { page: 2 },
      actor,
    );

    expect(service.getExportGoodsIssue).toHaveBeenCalledWith(
      TRANSFER_ID,
      actor,
    );
    // Branch scope is skipped because the XK belongs to the *source* branch —
    // this actor is the destination — and the service call above is what
    // authorized the read.
    expect(queryBus.execute).toHaveBeenCalledWith(
      new SearchGoodsIssueLinesV2Query(ISSUE_ID, { page: 2 }, actor, true),
    );
  });

  it("searches the import receipt's lines org-scoped, addressed by the transfer", async () => {
    await controller.searchImportGoodsReceiptLines(
      TRANSFER_ID,
      { page: 1 },
      actor,
    );

    expect(service.getImportGoodsReceipt).toHaveBeenCalledWith(
      TRANSFER_ID,
      actor,
    );
    expect(queryBus.execute).toHaveBeenCalledWith(
      new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, { page: 1 }, actor, true),
    );
  });

  // Skipping branch scope on the query is only safe while the service call in
  // front of it is the thing that authorizes: a branch that is neither end of
  // the transfer must never reach the query bus.
  it("never reaches the query bus when the actor's branch is not a participant", async () => {
    service.getExportGoodsIssue.mockRejectedValue(new NotFoundException());

    await expect(
      controller.searchExportGoodsIssueLines(TRANSFER_ID, {}, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });
});
