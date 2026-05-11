-- CreateTable
CREATE TABLE "gmail_accounts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "google_sub" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmail_messages" (
    "id" SERIAL NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "gmail_account_id" INTEGER NOT NULL,
    "from" TEXT,
    "subject" TEXT,
    "date" TIMESTAMP(3),
    "snippet" TEXT,
    "internal_date_ms" BIGINT,
    "raw_headers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gmail_accounts_user_id_idx" ON "gmail_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_accounts_user_id_google_sub_key" ON "gmail_accounts"("user_id", "google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_accounts_user_id_email_key" ON "gmail_accounts"("user_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_messages_gmail_message_id_key" ON "gmail_messages"("gmail_message_id");

-- CreateIndex
CREATE INDEX "gmail_messages_gmail_account_id_idx" ON "gmail_messages"("gmail_account_id");

-- AddForeignKey
ALTER TABLE "gmail_accounts" ADD CONSTRAINT "gmail_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmail_messages" ADD CONSTRAINT "gmail_messages_gmail_account_id_fkey" FOREIGN KEY ("gmail_account_id") REFERENCES "gmail_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

