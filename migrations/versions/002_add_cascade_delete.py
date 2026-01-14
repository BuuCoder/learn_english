"""Add cascade delete to foreign keys

Revision ID: 002_add_cascade_delete
Revises: 001_initial
Create Date: 2026-01-13

"""
from alembic import op


revision = '002_add_cascade_delete'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade():
    # Create foreign keys with ON DELETE CASCADE
    op.create_foreign_key(
        'fk_messages_conversation', 'messages', 'conversations',
        ['conversation_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_conversations_user', 'conversations', 'users',
        ['user_id'], ['id'],
        ondelete='CASCADE'
    )


def downgrade():
    op.drop_constraint('fk_messages_conversation', 'messages', type_='foreignkey')
    op.drop_constraint('fk_conversations_user', 'conversations', type_='foreignkey')
