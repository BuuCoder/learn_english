"""Create users, conversations, messages tables

Revision ID: 001_initial
Revises: 
Create Date: 2026-01-13

"""
from alembic import op
import sqlalchemy as sa


revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(80), nullable=False),
        sa.Column('email', sa.String(120), nullable=False),
        sa.Column('password_hash', sa.String(256), nullable=False),
        sa.Column('total_tokens_used', sa.Integer(), default=0),
        sa.Column('token_limit', sa.Integer(), default=100000),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.UniqueConstraint('email')
    )

    op.create_table('conversations',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(200), nullable=True),
        sa.Column('total_tokens', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.String(36), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('prompt_tokens', sa.Integer(), default=0),
        sa.Column('completion_tokens', sa.Integer(), default=0),
        sa.Column('total_tokens', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id']),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('messages')
    op.drop_table('conversations')
    op.drop_table('users')
