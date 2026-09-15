import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getCart: vi.fn(),
  getPublishedProduct: vi.fn(),
  removeCartItem: vi.fn(),
  setCartItemQuantity: vi.fn(),
  upsertCartItem: vi.fn(),
  userOwnsProduct: vi.fn(),
}));

vi.mock("@/features/cart/infrastructure/cart-repo", () => repository);

import { addToCart } from "@/features/cart/application/cart-service";

describe("personal digital licences in the cart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getPublishedProduct.mockResolvedValue({ id: "book-1" });
    repository.userOwnsProduct.mockResolvedValue(false);
    repository.upsertCartItem.mockResolvedValue(1);
  });

  it("rejects a request for more than one copy before touching persistence", async () => {
    const result = await addToCart("customer-1", { productId: "book-1", quantity: 2 });

    expect(result).toEqual({ ok: false, error: { code: "INVALID_QUANTITY" } });
    expect(repository.getPublishedProduct).not.toHaveBeenCalled();
    expect(repository.upsertCartItem).not.toHaveBeenCalled();
  });

  it("refuses a book the customer already owns", async () => {
    repository.userOwnsProduct.mockResolvedValue(true);

    const result = await addToCart("customer-1", { productId: "book-1", quantity: 1 });

    expect(result).toEqual({ ok: false, error: { code: "ALREADY_OWNED" } });
    expect(repository.upsertCartItem).not.toHaveBeenCalled();
  });

  it("stores exactly one personal licence for a new book", async () => {
    const result = await addToCart("customer-1", { productId: "book-1", quantity: 1 });

    expect(result).toEqual({ ok: true });
    expect(repository.upsertCartItem).toHaveBeenCalledWith("customer-1", "book-1", 1, 1);
  });
});
