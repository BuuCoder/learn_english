"""Add soft delete to conversations

Revision ID: 005_add_soft_delete
Revises: 004_add_message_status
Create Date: 2026-01-14
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '005_add_soft_delete'
down_revision = '004_add_message_status'
branch_labels = None
depends_on = None


def upgrade():
    # Add soft delete columns to conversations
    op.add_column('conversations', sa.Column('is_deleted', sa.Boolean(), nullable=True, server_default='0'))
    op.add_column('conversations', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('conversations', 'deleted_at')
    op.drop_column('conversations', 'is_deleted')
