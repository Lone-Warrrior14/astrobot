import asyncio
from backend.app.database.session import engine, Base
from backend.app.models.entities import Conversation, Message, MemoryRecord, DocumentRecord, UserSetting

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables initialized successfully.")

if __name__ == "__main__":
    asyncio.run(init_db())

