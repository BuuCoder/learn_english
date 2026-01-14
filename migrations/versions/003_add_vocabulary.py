"""Add vocabulary table

Revision ID: 003_add_vocabulary
Revises: 002_add_cascade_delete
Create Date: 2025-01-13
"""

from alembic import op
import sqlalchemy as sa

revision = '003_add_vocabulary'
down_revision = '002_add_cascade_delete'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('vocabularies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('word', sa.String(200), nullable=False),
        sa.Column('note', sa.Text(), default=''),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_vocabularies_user_id', 'vocabularies', ['user_id'])


def downgrade():
    op.drop_index('ix_vocabularies_user_id', 'vocabularies')
    op.drop_table('vocabularies')
