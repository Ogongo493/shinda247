export * from "./generated/api";

// Re-export generated TS types, excluding names that conflict with the Zod
// schema constants above (CashOutResponse, PlaceBetResponse). Consumers that
// need the raw interfaces can import directly from "@workspace/api-zod/generated/types".
export type {
  ActivePlayer,
  AuthResponse,
  CashOutRequest,
  DepositRequest,
  DepositResponse,
  ErrorResponse,
  GamePhase,
  GameRound,
  GameState,
  GetGameHistoryParams,
  HealthStatus,
  LeaderboardPlayer,
  LoginRequest,
  OtpSentResponse,
  PlaceBetRequest,
  RegisterRequest,
  UserProfile,
  VerifyOtpRequest,
  WalletInfo,
  WithdrawRequest,
  WithdrawResponse,
} from "./generated/types";
