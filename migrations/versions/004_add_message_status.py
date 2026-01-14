"""Add status column to messages table

Revision ID: 004_add_message_status
Revises: 003_add_vocabulary
Create Date: 2025-01-13
"""

from alembic import op
import sqlalchemy as sa

revision = '004_add_message_status'
down_revision = '003_add_vocabulary'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('messages', sa.Column('status', sa.String(20), default='completed'))
    # Update existing messages to 'completed'
    op.execute("UPDATE messages SET status = 'completed' WHERE status IS NULL")


def downgrade():
    op.drop_column('messages', 'status')
